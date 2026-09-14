const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const liveStreamRepository = require('../repositories/liveStream.repository');
const { broadcastEvent } = require('../sockets/socket.service');
const { wrapEnvelope } = require('../utils/envelope');
const { normalizeText } = require('../utils/text');
const { getGiftTier } = require('../utils/giftTier');

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
    enableExtendedGiftInfo: true,
  });

  connectionContexts.set(uniqueId, { roomId: uniqueId, joinCounts: new Map() });
  registerEventHandlers(connection, uniqueId);
  activeConnections.set(uniqueId, connection);
  activeUniqueId = uniqueId;

  return connection
    .connect()
    .then((state) => {
      console.log(`[${uniqueId}] Connected to roomId ${state.roomId}`);
      const context = connectionContexts.get(uniqueId);
      if (context) {
        context.roomId = state.roomId;
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

function disconnectFromLiveStream(uniqueId) {
  const connection = activeConnections.get(uniqueId);
  if (!connection) {
    return false;
  }
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
 * @returns {boolean} true if a connection was actually torn down
 */
function disconnectCurrentLiveStream() {
  if (!activeUniqueId) {
    return false;
  }
  return disconnectFromLiveStream(activeUniqueId);
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
};
