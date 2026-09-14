const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const liveStreamRepository = require('../repositories/liveStream.repository');

/**
 * Active anonymous connections keyed by TikTok username, so a duplicate
 * connect request reuses the existing socket instead of opening a new one.
 */
const activeConnections = new Map();

/**
 * The single room the (one-room-at-a-time) dashboard is currently monitoring,
 * so the disconnect endpoint -- which the frontend calls with no body -- knows
 * which connection to tear down.
 */
let activeUniqueId = null;

/**
 * Opens an anonymous (no login/cookie) connection to a TikTok LIVE room and
 * wires up raw-data extraction for chat messages, gifts, and room user
 * (viewer join / viewer count) events.
 *
 * @param {string} uniqueId TikTok username (without the leading '@')
 * @returns {Promise<import('tiktok-live-connector').TikTokLiveConnection['state']>} resolves once actually connected
 */
function connectToLiveStream(uniqueId) {
  const existing = activeConnections.get(uniqueId);
  if (existing) {
    activeUniqueId = uniqueId;
    return Promise.resolve(existing.state);
  }

  const connection = new TikTokLiveConnection(uniqueId, {
    // No sessionId / cookies provided -> anonymous connection.
    enableExtendedGiftInfo: true,
  });

  registerEventHandlers(connection, uniqueId);
  activeConnections.set(uniqueId, connection);
  activeUniqueId = uniqueId;

  return connection
    .connect()
    .then((state) => {
      console.log(`[${uniqueId}] Connected to roomId ${state.roomId}`);
      return state;
    })
    .catch((err) => {
      console.error(`[${uniqueId}] Failed to connect:`, err.message);
      activeConnections.delete(uniqueId);
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
    if (activeUniqueId === uniqueId) {
      activeUniqueId = null;
    }
  });

  connection.on(ControlEvent.ERROR, (err) => {
    console.error(`[${uniqueId}] connection error:`, err.message || err);
  });

  // Chat message
  connection.on(WebcastEvent.CHAT, (data) => {
    const chatMessage = extractChatData(uniqueId, data);
    console.log('[CHAT]', chatMessage);
  });

  // Gift sent by a viewer
  connection.on(WebcastEvent.GIFT, (data) => {
    const giftEvent = extractGiftData(uniqueId, data);
    console.log('[GIFT]', giftEvent);
  });

  // Room user update (viewer count / join events)
  connection.on(WebcastEvent.ROOM_USER, (data) => {
    const roomUserEvent = extractRoomUserData(uniqueId, data);
    console.log('[ROOM_USER]', roomUserEvent);
  });
}

function extractChatData(uniqueId, data) {
  return {
    room: uniqueId,
    userId: data.user?.userId,
    username: data.user?.uniqueId,
    nickname: data.user?.nickname,
    comment: data.comment,
    createTime: data.eventTime ?? Date.now(),
  };
}

function extractGiftData(uniqueId, data) {
  return {
    room: uniqueId,
    userId: data.user?.userId,
    username: data.user?.uniqueId,
    nickname: data.user?.nickname,
    giftId: data.giftId,
    giftName: data.gift?.name,
    repeatCount: data.repeatCount,
    repeatEnd: data.repeatEnd,
    diamondCount: data.gift?.diamondCount,
    createTime: data.eventTime ?? Date.now(),
  };
}

function extractRoomUserData(uniqueId, data) {
  return {
    room: uniqueId,
    viewerCount: data.viewerCount,
    createTime: data.eventTime ?? Date.now(),
  };
}

function disconnectFromLiveStream(uniqueId) {
  const connection = activeConnections.get(uniqueId);
  if (!connection) {
    return false;
  }
  connection.disconnect();
  activeConnections.delete(uniqueId);
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
