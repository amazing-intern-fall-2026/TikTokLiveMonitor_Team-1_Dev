const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { eulerApiKey } = require('../config/env');
const liveStreamRepository = require('../repositories/liveStream.repository');
const sessionRepository = require('../repositories/session.repository');
const { broadcastEvent } = require('../sockets/socket.service');
const { wrapEnvelope } = require('../utils/envelope');
const { normalizeText } = require('../utils/text');
const { getGiftTier } = require('../utils/giftTier');
const ruleEngine = require('./RuleEngine.service');
const eventBatch = require('./eventBatch.service');
const sessionReportService = require('./sessionReport.service');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('liveStream');

/**
 * tiktok-live-connector's WebcastEvent.MEMBER also fires for actions other
 * than joining the room (e.g. subscribing); only MEMBER_MESSAGE_ACTION_JOINED
 * (1) should be broadcast as a MEMBER_JOIN event. Anything else the field
 * comes back as (including undefined, in case the shape differs at runtime)
 * is treated as a join so we fail open rather than silently drop real events.
 */
const MEMBER_ACTION_SUBSCRIBED = 3;

/**
 * BR-JN-04: JOIN events TikTok replays for viewers who were already in the
 * room before we connected arrive in a burst right after CONNECTED fires --
 * flag anything in that opening window as backlog rather than a real,
 * newly-arriving viewer.
 */
const BACKLOG_WINDOW_MS = 10000;

/**
 * BR-JN-02: a viewer surge (or the BR-JN-04 backlog replay right after
 * connect) can fire dozens of JOIN events per second -- broadcasting each
 * one 1:1 would flood the dashboard feed. Queue envelopes per connection and
 * drain at most one per second instead.
 */
const JOIN_BROADCAST_INTERVAL_MS = 1000;

/**
 * FR-06: when the WebSocket to TikTok drops after having been connected
 * (ControlEvent.DISCONNECTED -- never fired for an *initial* failed connect,
 * see connectToLiveStream()'s own .catch()), retry on the same connection
 * instance with exponential backoff + jitter instead of tearing the session
 * down on the first blip. Formula: min(base * multiplier^attempt, maxMs),
 * then +/- jitter fraction applied on top; gives up after maxAttempts.
 */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MULTIPLIER = 2;
const RECONNECT_MAX_MS = 30000;
const RECONNECT_JITTER = 0.2;
const RECONNECT_MAX_ATTEMPTS = 5;

/**
 * Active anonymous connections keyed by TikTok username, so a duplicate
 * connect request reuses the existing socket instead of opening a new one.
 */
const activeConnections = new Map();

/**
 * Per-connection state that isn't part of the tiktok-live-connector API:
 * the resolved roomId (only known once CONNECTED fires), a running
 * per-viewer join count for the session (isFirstJoinInSession/
 * joinCountInSession), the BR-JN-02 pending-JOIN-broadcast queue/timer, and
 * the FR-06 reconnect bookkeeping (attempt count/timer, and whether the
 * current disconnect was requested by us vs. a real drop).
 */
const connectionContexts = new Map();

/**
 * The single room the (one-room-at-a-time) dashboard is currently monitoring,
 * so the disconnect endpoint -- which the frontend calls with no body -- knows
 * which connection to tear down.
 */
let activeUniqueId = null;

/**
 * Opens an anonymous (no login/cookie) connection to a TikTok LIVE room and
 * wires up event handlers that broadcast CHAT/GIFT/MEMBER_JOIN over Socket.IO.
 *
 * @param {string} uniqueId TikTok username (without the leading '@')
 * @returns {Promise<import('tiktok-live-connector').TikTokLiveConnection['state']>} resolves once actually connected
 */
function connectToLiveStream(uniqueId) {
  const existingConnection = activeConnections.get(uniqueId);
  if (existingConnection) {
    activeUniqueId = uniqueId;
    return Promise.resolve(existingConnection.state);
  }

  const connection = new TikTokLiveConnection(uniqueId, {
    // No sessionId / cookies provided -> anonymous connection.
    // enableExtendedGiftInfo fetches the room's gift catalog via the
    // EulerStream sign server, which now requires a paid Business plan;
    // on the free tier this makes every connect() attempt fail with
    // "This endpoint requires a Business plan." Our own gift payload
    // (giftId/giftName/unitDiamondValue from the GIFT event itself) does
    // not depend on this catalog, so leave it disabled.
    enableExtendedGiftInfo: false,
    // Without a key, WebSocket signing shares Euler Stream's free community
    // rate-limit pool with every other anonymous user of this library and
    // fails unpredictably under load. An API key (free signup at
    // https://www.eulerstream.com) raises that limit; omit the option
    // entirely when unset so we still fall back to the anonymous pool.
    ...(eulerApiKey ? { signApiKey: eulerApiKey } : {}),
  });

  const context = {
    roomId: uniqueId,
    joinCounts: new Map(),
    liveStreamId: null,
    sessionId: null,
    connectedAt: null,
    joinBroadcastQueue: [],
    joinBroadcastTimer: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    manualDisconnect: false,
  };
  connectionContexts.set(uniqueId, context);
  context.joinBroadcastTimer = setInterval(
    () => flushJoinBroadcastQueue(uniqueId),
    JOIN_BROADCAST_INTERVAL_MS
  );
  registerEventHandlers(connection, uniqueId);
  activeConnections.set(uniqueId, connection);
  activeUniqueId = uniqueId;

  return connection
    .connect()
    .then(async (state) => {
      logger.info('Connected', { uniqueId, roomId: state.roomId });
      const context = connectionContexts.get(uniqueId);
      if (context) {
        context.roomId = state.roomId;
        context.connectedAt = Date.now();
      }

      // Best-effort: persistence must never block or break the live relay,
      // so a DB outage here only means events won't be saved, not that the
      // connection fails.
      try {
        const liveStream = await liveStreamRepository.findOrCreateByHostUsername(uniqueId);
        const session = await sessionRepository.create(liveStream.id);
        if (context) {
          context.liveStreamId = liveStream.id;
          context.sessionId = session.id;
        }
      } catch (err) {
        logger.error('Failed to open a DB session (events will not be persisted)', { uniqueId, error: err.message });
      }

      return state;
    })
    .catch((err) => {
      logger.error('Failed to connect', { uniqueId, error: err.message });
      stopJoinBroadcastTimer(uniqueId);
      activeConnections.delete(uniqueId);
      connectionContexts.delete(uniqueId);
      if (activeUniqueId === uniqueId) {
        activeUniqueId = null;
      }
      throw err;
    });
}

function registerEventHandlers(connection, uniqueId) {
  connection.on(ControlEvent.CONNECTED, (state) => {
    logger.info('Connector established', { uniqueId, roomId: state.roomId });
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    logger.info('Connector disconnected', { uniqueId });
    const context = connectionContexts.get(uniqueId);
    // No context (already torn down by disconnectFromLiveStream) or an
    // explicit disconnect that beat this event -- nothing left to reconnect.
    if (!context || context.manualDisconnect) {
      return;
    }
    // FR-06: an unrequested drop -- retry with backoff instead of tearing
    // the session down immediately (see scheduleReconnect()).
    scheduleReconnect(uniqueId, connection);
  });

  connection.on(ControlEvent.ERROR, (err) => {
    logger.error('Connector error', { uniqueId, error: err.message || String(err) });
  });

  // Chat message -> broadcast as a COMMENT envelope on the 'CHAT' channel.
  connection.on(WebcastEvent.CHAT, (data) => {
    const text = data.comment ?? data.content ?? '';
    const envelope = wrapEnvelope({
      type: 'COMMENT',
      roomId: String(getRoomId(uniqueId)),
      user: extractUser(data.user),
      payload: {
        text,
        textNormalized: normalizeText(text),
        length: text.length,
        containsKeywords: [],
      },
      sourceTimestamp: extractSourceTimestamp(data),
    });
    broadcastEvent('CHAT', envelope);
    ruleEngine.processEvent(envelope, connectionContexts.get(uniqueId)?.sessionId);
    queuePersist(uniqueId, 'CHAT', envelope, { comment: text });
  });

  // Gift sent by a viewer -> broadcast as a GIFT envelope.
  connection.on(WebcastEvent.GIFT, (data) => {
    // Debugging BR-GF-01: log the RAW repeatEnd (before any mapping/defaulting
    // into the envelope's isStreakFinished) for every real gift, to tell apart
    // "the connector never sends repeatEnd: true" from "the closing event gets
    // lost mid-stream" (e.g. a disconnect/room switch between combo ticks).
    logger.debug('Raw GIFT repeatEnd', {
      uniqueId,
      giftId: data.giftId ?? data.gift?.id,
      giftName: data.gift?.name,
      isStreakable: Boolean(data.gift?.combo),
      repeatCount: data.repeatCount,
      repeatEnd: data.repeatEnd,
      repeatEndType: typeof data.repeatEnd,
    });

    // BR-GF-05: warn when the TikTok payload omits the diamond value so operators
    // know the gift will be counted as 0 diamonds and may not trigger diamond-based rules.
    if (data.gift?.diamondCount == null) {
      logger.warn('BR-GF-05: gift received with unknown diamond value (defaulting to 0)', {
        uniqueId,
        giftId: data.giftId ?? data.gift?.id,
        giftName: data.gift?.name ?? 'Unknown Gift',
      });
    }

    const unitDiamondValue = data.gift?.diamondCount ?? 0;
    const repeatCount = data.repeatCount ?? 1;
    const totalDiamondValue = unitDiamondValue * repeatCount;
    const envelope = wrapEnvelope({
      type: 'GIFT',
      roomId: String(getRoomId(uniqueId)),
      user: extractUser(data.user),
      payload: {
        giftId: data.giftId ?? data.gift?.id,
        giftName: data.gift?.name ?? 'Unknown Gift',
        giftImageUrl: data.giftDetails?.giftImage?.image_url,
        unitDiamondValue,
        repeatCount,
        totalDiamondValue,
        isStreakable: Boolean(data.gift?.combo),
        isStreakFinished: Boolean(data.repeatEnd),
        giftTier: getGiftTier(totalDiamondValue),
      },
      sourceTimestamp: extractSourceTimestamp(data),
    });
    broadcastEvent('GIFT', envelope);
    ruleEngine.processEvent(envelope, connectionContexts.get(uniqueId)?.sessionId);
    queuePersist(uniqueId, 'GIFT', envelope, {
      giftId: envelope.payload.giftId,
      giftName: envelope.payload.giftName,
      repeatCount: envelope.payload.repeatCount,
      diamondCount: envelope.payload.unitDiamondValue,
      repeatEnd: envelope.payload.isStreakFinished,
    });
  });

  // Member joined the room -> queue a JOIN envelope for 'MEMBER_JOIN',
  // broadcast at most one per second (BR-JN-02, see flushJoinBroadcastQueue).
  // (WebcastEvent.ROOM_USER, the periodic viewer-count tick, is intentionally
  // NOT broadcast here -- it doesn't represent a specific viewer action.)
  connection.on(WebcastEvent.MEMBER, (data) => {
    if (data.action === MEMBER_ACTION_SUBSCRIBED) {
      return;
    }

    const user = extractUser(data.user);
    const { isFirstJoinInSession, joinCountInSession } = trackJoin(uniqueId, user.userId);
    const connectedAt = connectionContexts.get(uniqueId)?.connectedAt;
    const isBacklog = connectedAt != null && Date.now() - connectedAt < BACKLOG_WINDOW_MS;
    const envelope = wrapEnvelope({
      type: 'JOIN',
      roomId: String(getRoomId(uniqueId)),
      user,
      payload: {
        isFirstJoinInSession,
        joinCountInSession,
        isBacklog,
      },
      sourceTimestamp: extractSourceTimestamp(data),
    });
    enqueueJoinBroadcast(uniqueId, envelope);
    ruleEngine.processEvent(envelope, connectionContexts.get(uniqueId)?.sessionId);
    queuePersist(uniqueId, 'JOIN', envelope, {});
  });

  // Periodic viewer-count tick -- not a per-viewer action, so it's not run
  // through the RuleEngine or persisted as an event row, but it IS broadcast
  // (VIEWER_COUNT) so the dashboard's live viewer count no longer sits at 0
  // between JOIN events.
  connection.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = extractViewerCount(data);
    if (viewerCount === undefined) {
      return;
    }

    broadcastEvent('VIEWER_COUNT', wrapEnvelope({
      type: 'VIEWER_COUNT',
      roomId: String(getRoomId(uniqueId)),
      user: null,
      payload: { viewerCount },
      sourceTimestamp: extractSourceTimestamp(data),
    }));

    const context = connectionContexts.get(uniqueId);
    if (!context?.liveStreamId) {
      return;
    }
    liveStreamRepository.updateViewerCount(context.liveStreamId, viewerCount).catch((err) => {
      logger.error('Failed to update viewer count', { uniqueId, error: err.message });
    });
  });
}

function getRoomId(uniqueId) {
  return connectionContexts.get(uniqueId)?.roomId ?? uniqueId;
}

/**
 * BR-JN-02: queues a JOIN envelope instead of broadcasting it immediately --
 * flushJoinBroadcastQueue() (run on a 1s interval) drains it one at a time.
 */
function enqueueJoinBroadcast(uniqueId, envelope) {
  connectionContexts.get(uniqueId)?.joinBroadcastQueue.push(envelope);
}

/**
 * Broadcasts at most one queued JOIN envelope per tick, so 'MEMBER_JOIN'
 * never fires faster than JOIN_BROADCAST_INTERVAL_MS regardless of how many
 * real joins arrived in that window (BR-JN-02).
 */
function flushJoinBroadcastQueue(uniqueId) {
  const queue = connectionContexts.get(uniqueId)?.joinBroadcastQueue;
  if (!queue || queue.length === 0) {
    return;
  }
  broadcastEvent('MEMBER_JOIN', queue.shift());
}

function stopJoinBroadcastTimer(uniqueId) {
  const timer = connectionContexts.get(uniqueId)?.joinBroadcastTimer;
  if (timer) {
    clearInterval(timer);
  }
}

/**
 * FR-06: `base * multiplier^attempt` capped at RECONNECT_MAX_MS, then a
 * uniform random +/-RECONNECT_JITTER fraction on top -- the jitter keeps a
 * pool of connections that all dropped together (e.g. a shared network blip)
 * from all retrying in the same instant.
 */
function calcReconnectDelay(attempt) {
  const base = Math.min(RECONNECT_BASE_MS * RECONNECT_MULTIPLIER ** attempt, RECONNECT_MAX_MS);
  const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

/**
 * FR-06: schedules the next reconnect attempt on the SAME connection
 * instance (tiktok-live-connector supports calling connect() again after a
 * drop), so already-registered event handlers keep working and the DB
 * session/context aren't recreated for what's meant to be a brief blip.
 * Gives up (and tears the session down for real) once RECONNECT_MAX_ATTEMPTS
 * is reached.
 */
function scheduleReconnect(uniqueId, connection) {
  const context = connectionContexts.get(uniqueId);
  if (!context) {
    return;
  }

  if (context.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
    giveUpReconnecting(uniqueId);
    return;
  }

  const delay = calcReconnectDelay(context.reconnectAttempts);
  context.reconnectAttempts += 1;
  const attemptNumber = context.reconnectAttempts;
  logger.warn('FR-06: connection lost, scheduling reconnect', {
    uniqueId,
    attempt: attemptNumber,
    maxAttempts: RECONNECT_MAX_ATTEMPTS,
    delayMs: delay,
  });

  context.reconnectTimer = setTimeout(() => {
    connection
      .connect()
      .then(() => {
        logger.info('FR-06: reconnected', { uniqueId, afterAttempts: attemptNumber });
        const reconnectedContext = connectionContexts.get(uniqueId);
        if (reconnectedContext) {
          reconnectedContext.reconnectAttempts = 0;
          // TikTok replays the current viewer backlog again after a fresh
          // WebSocket handshake -- restart the BR-JN-04 backlog window.
          reconnectedContext.connectedAt = Date.now();
        }
      })
      .catch((err) => {
        logger.error('FR-06: reconnect attempt failed', { uniqueId, attempt: attemptNumber, error: err.message });
        scheduleReconnect(uniqueId, connection);
      });
  }, delay);
}

/**
 * FR-06: retries exhausted -- same teardown the old unconditional
 * ControlEvent.DISCONNECTED handler used to do.
 */
function giveUpReconnecting(uniqueId) {
  logger.error('FR-06: reconnect attempts exhausted, giving up', { uniqueId, maxAttempts: RECONNECT_MAX_ATTEMPTS });
  closeSession(uniqueId, 'disconnected');
  stopJoinBroadcastTimer(uniqueId);
  activeConnections.delete(uniqueId);
  connectionContexts.delete(uniqueId);
  if (activeUniqueId === uniqueId) {
    activeUniqueId = null;
  }
}

/**
 * Tracks how many times a given viewer has joined this connection's session,
 * for the JOIN envelope's isFirstJoinInSession/joinCountInSession fields.
 */
function trackJoin(uniqueId, userId) {
  const context = connectionContexts.get(uniqueId);
  const joinCounts = context?.joinCounts;
  const key = userId || 'unknown';
  const count = (joinCounts?.get(key) ?? 0) + 1;
  joinCounts?.set(key, count);
  return { isFirstJoinInSession: count === 1, joinCountInSession: count };
}

/**
 * tiktok-live-connector's documented event shape uses flattened fields
 * (user.userId/uniqueId/nickname), but the underlying protobuf type only
 * guarantees user.id/displayId/nickname -- fall back across both so
 * extraction keeps working regardless of which shape is actually emitted.
 */
function extractUser(rawUser) {
  const user = rawUser || {};
  return {
    userId: String(user.userId ?? user.id ?? 'unknown'),
    uniqueId: user.uniqueId ?? user.displayId ?? 'unknown',
    nickname: user.nickname ?? 'TikTok User',
  };
}

function extractSourceTimestamp(data) {
  const raw = data.createTime ?? data.common?.createTime;
  return raw ? Number(raw) : undefined;
}

function toDate(epochMillis) {
  return epochMillis ? new Date(epochMillis) : undefined;
}

/**
 * tiktok-live-connector's documented shape exposes data.viewerCount directly,
 * but the raw ROOM_USER protobuf only guarantees totalUser/total as strings --
 * fall back across both, same rationale as extractUser().
 */
function extractViewerCount(data) {
  const raw = data.viewerCount ?? data.totalUser ?? data.total;
  return raw === undefined ? undefined : Number(raw);
}

/**
 * Queues a CHAT/GIFT/JOIN event (both its normalized row and its raw
 * Envelope copy) for the AsyncEventBatcher instead of writing to Postgres
 * immediately -- a synchronous push, so it adds no latency to the Fast-Path
 * Socket broadcast this is called right after. No-op if this connection has
 * no open DB session (mock/test events never do).
 */
function queuePersist(uniqueId, eventType, envelope, extra) {
  const context = connectionContexts.get(uniqueId);
  if (!context?.sessionId) {
    return;
  }
  eventBatch.enqueue({
    sessionId: context.sessionId,
    eventType,
    user: envelope.user,
    occurredAt: toDate(envelope.sourceTimestamp),
    extra,
    envelope,
  });
}

/**
 * Marks the connection's DB session closed, at most once (subsequent calls
 * are a no-op once sessionId is cleared) -- both the ControlEvent.DISCONNECTED
 * handler and an explicit disconnectFromLiveStream() call this, and either
 * one may run first depending on whether the library emits the control event
 * synchronously from connection.disconnect().
 *
 * FR-35/FR-36: once marked closed, generates and persists the session's
 * summary report. Best-effort/fire-and-forget (not awaited) -- a report
 * failure must never delay tearing down the connection.
 */
async function closeSession(uniqueId, status) {
  const context = connectionContexts.get(uniqueId);
  const sessionId = context?.sessionId;
  if (!sessionId) {
    return;
  }
  context.sessionId = null;
  try {
    // AsyncEventBatcher may still be holding up to 2s/99 events for this
    // session -- flush them now so the FR-36 report below doesn't miss them.
    await eventBatch.flush();
    await sessionRepository.markDisconnected(sessionId, { status });
    sessionReportService.generateReport(sessionId).catch((err) => {
      console.error(`[${uniqueId}] Failed to generate session report:`, err.message);
    });
  } catch (err) {
    logger.error(`Failed to mark session ${status}`, { uniqueId, sessionId, error: err.message });
  }
}

async function disconnectFromLiveStream(uniqueId) {
  const connection = activeConnections.get(uniqueId);
  if (!connection) {
    return false;
  }
  const context = connectionContexts.get(uniqueId);
  if (context) {
    // FR-06: this disconnect is requested, not a drop -- don't reconnect.
    context.manualDisconnect = true;
    if (context.reconnectTimer) {
      clearTimeout(context.reconnectTimer);
    }
  }
  await closeSession(uniqueId, 'disconnected');
  connection.disconnect();
  stopJoinBroadcastTimer(uniqueId);
  activeConnections.delete(uniqueId);
  connectionContexts.delete(uniqueId);
  if (activeUniqueId === uniqueId) {
    activeUniqueId = null;
  }
  return true;
}

/**
 * Disconnects whichever room the dashboard is currently monitoring.
 * @returns {Promise<boolean>} true if a connection was actually torn down
 */
function disconnectCurrentLiveStream() {
  if (!activeUniqueId) {
    return Promise.resolve(false);
  }
  return disconnectFromLiveStream(activeUniqueId);
}

/** The DB session id of whichever room is currently being monitored, or null if none. Used to attribute manually-triggered effects (e.g. the kill switch) to the right session's log (FR-35). */
function getCurrentSessionId() {
  if (!activeUniqueId) {
    return null;
  }
  return connectionContexts.get(activeUniqueId)?.sessionId ?? null;
}

function getAllLiveStreams() {
  return liveStreamRepository.findAll();
}

function getLiveStreamById(id) {
  return liveStreamRepository.findById(id);
}

function createLiveStream(data) {
  return liveStreamRepository.create(data);
}

module.exports = {
  getAllLiveStreams,
  getLiveStreamById,
  createLiveStream,
  connectToLiveStream,
  disconnectFromLiveStream,
  disconnectCurrentLiveStream,
  getCurrentSessionId,
};
