const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { eulerApiKey } = require('../config/env');
const liveStreamRepository = require('../repositories/liveStream.repository');
const sessionRepository = require('../repositories/session.repository');
const appUserRepository = require('../repositories/appUser.repository');
const eventRepository = require('../repositories/event.repository');
const { broadcastEvent } = require('../sockets/socket.service');
const { wrapEnvelope } = require('../utils/envelope');
const { normalizeText } = require('../utils/text');
const { getGiftTier } = require('../utils/giftTier');
const ruleEngine = require('./RuleEngine.service');
const sessionReportService = require('./sessionReport.service');

/**
 * tiktok-live-connector's WebcastEvent.MEMBER also fires for actions other
 * than joining the room (e.g. subscribing); only MEMBER_MESSAGE_ACTION_JOINED
 * (1) should be broadcast as a MEMBER_JOIN event. Anything else the field
 * comes back as (including undefined, in case the shape differs at runtime)
 * is treated as a join so we fail open rather than silently drop real events.
 */
const MEMBER_ACTION_SUBSCRIBED = 3;

/**
 * Active anonymous connections keyed by TikTok username, so a duplicate
 * connect request reuses the existing socket instead of opening a new one.
 */
const activeConnections = new Map();

/**
 * Per-connection state that isn't part of the tiktok-live-connector API:
 * the resolved roomId (only known once CONNECTED fires) and a running
 * per-viewer join count for the session, used to fill the JOIN envelope's
 * isFirstJoinInSession/joinCountInSession fields.
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

  connectionContexts.set(uniqueId, {
    roomId: uniqueId,
    joinCounts: new Map(),
    liveStreamId: null,
    sessionId: null,
  });
  registerEventHandlers(connection, uniqueId);
  activeConnections.set(uniqueId, connection);
  activeUniqueId = uniqueId;

  return connection
    .connect()
    .then(async (state) => {
      console.log(`[${uniqueId}] Connected to roomId ${state.roomId}`);
      const context = connectionContexts.get(uniqueId);
      if (context) {
        context.roomId = state.roomId;
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
        console.error(`[${uniqueId}] Failed to open a DB session (events will not be persisted):`, err.message);
      }

      return state;
    })
    .catch((err) => {
      console.error(`[${uniqueId}] Failed to connect:`, err.message);
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
    console.log(`[${uniqueId}] connected, roomId=${state.roomId}`);
  });

  connection.on(ControlEvent.DISCONNECTED, () => {
    console.log(`[${uniqueId}] disconnected`);
    closeSession(uniqueId, 'disconnected');
    activeConnections.delete(uniqueId);
    connectionContexts.delete(uniqueId);
    if (activeUniqueId === uniqueId) {
      activeUniqueId = null;
    }
  });

  connection.on(ControlEvent.ERROR, (err) => {
    console.error(`[${uniqueId}] connection error:`, err.message || err);
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
    persistEvent(uniqueId, 'CHAT', envelope.user, { comment: text, occurredAt: toDate(envelope.sourceTimestamp) });
  });

  // Gift sent by a viewer -> broadcast as a GIFT envelope.
  connection.on(WebcastEvent.GIFT, (data) => {
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
    persistEvent(uniqueId, 'GIFT', envelope.user, {
      giftId: envelope.payload.giftId,
      giftName: envelope.payload.giftName,
      repeatCount: envelope.payload.repeatCount,
      diamondCount: envelope.payload.unitDiamondValue,
      repeatEnd: envelope.payload.isStreakFinished,
      occurredAt: toDate(envelope.sourceTimestamp),
    });
  });

  // Member joined the room -> broadcast as a JOIN envelope on 'MEMBER_JOIN'.
  // (WebcastEvent.ROOM_USER, the periodic viewer-count tick, is intentionally
  // NOT broadcast here -- it doesn't represent a specific viewer action.)
  connection.on(WebcastEvent.MEMBER, (data) => {
    if (data.action === MEMBER_ACTION_SUBSCRIBED) {
      return;
    }

    const user = extractUser(data.user);
    const { isFirstJoinInSession, joinCountInSession } = trackJoin(uniqueId, user.userId);
    const envelope = wrapEnvelope({
      type: 'JOIN',
      roomId: String(getRoomId(uniqueId)),
      user,
      payload: {
        isFirstJoinInSession,
        joinCountInSession,
      },
      sourceTimestamp: extractSourceTimestamp(data),
    });
    broadcastEvent('MEMBER_JOIN', envelope);
    ruleEngine.processEvent(envelope, connectionContexts.get(uniqueId)?.sessionId);
    persistEvent(uniqueId, 'JOIN', envelope.user, { occurredAt: toDate(envelope.sourceTimestamp) });
  });

  // Periodic viewer-count tick -- NOT a per-viewer event, so it only updates
  // live_streams.viewer_count and is never broadcast or turned into an event row.
  connection.on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = extractViewerCount(data);
    const context = connectionContexts.get(uniqueId);
    if (viewerCount === undefined || !context?.liveStreamId) {
      return;
    }
    liveStreamRepository.updateViewerCount(context.liveStreamId, viewerCount).catch((err) => {
      console.error(`[${uniqueId}] Failed to update viewer count:`, err.message);
    });
  });
}

function getRoomId(uniqueId) {
  return connectionContexts.get(uniqueId)?.roomId ?? uniqueId;
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
 * Persists a CHAT/GIFT/JOIN event (upserting the viewer first) if this
 * connection has an open DB session. Fire-and-forget by design: a DB error
 * is logged, never allowed to affect the live Socket.IO relay.
 */
async function persistEvent(uniqueId, eventType, user, extra) {
  const context = connectionContexts.get(uniqueId);
  if (!context?.sessionId) {
    return;
  }

  try {
    const appUser = await appUserRepository.upsert({
      tiktokUserId: user.userId,
      username: user.uniqueId,
      nickname: user.nickname,
    });

    const base = { sessionId: context.sessionId, appUserId: appUser.id, occurredAt: extra.occurredAt };
    if (eventType === 'CHAT') {
      await eventRepository.insertCommentEvent({ ...base, comment: extra.comment });
    } else if (eventType === 'GIFT') {
      await eventRepository.insertGiftEvent({
        ...base,
        giftId: extra.giftId,
        giftName: extra.giftName,
        repeatCount: extra.repeatCount,
        diamondCount: extra.diamondCount,
        repeatEnd: extra.repeatEnd,
      });
    } else if (eventType === 'JOIN') {
      await eventRepository.insertJoinEvent(base);
    }
  } catch (err) {
    console.error(`[${uniqueId}] Failed to persist ${eventType} event:`, err.message);
  }
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
    await sessionRepository.markDisconnected(sessionId, { status });
    sessionReportService.generateReport(sessionId).catch((err) => {
      console.error(`[${uniqueId}] Failed to generate session report:`, err.message);
    });
  } catch (err) {
    console.error(`[${uniqueId}] Failed to mark session ${status}:`, err.message);
  }
}

async function disconnectFromLiveStream(uniqueId) {
  const connection = activeConnections.get(uniqueId);
  if (!connection) {
    return false;
  }
  await closeSession(uniqueId, 'disconnected');
  connection.disconnect();
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
