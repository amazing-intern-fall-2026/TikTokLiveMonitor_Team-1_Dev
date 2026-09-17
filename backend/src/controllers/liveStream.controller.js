const {
  InvalidUniqueIdError,
  InvalidResponseCompositeError,
  UserOfflineError,
  SignatureRateLimitError,
  ConnectTimeoutError,
} = require('tiktok-live-connector');
const liveStreamService = require('../services/liveStream.service');

// TikTok usernames: letters/digits/underscore/period, 2-24 chars (no leading '@').
const USERNAME_PATTERN = /^[a-zA-Z0-9._]{2,24}$/;

async function getAll(req, res) {
  res.json(await liveStreamService.getAllLiveStreams());
}

async function getById(req, res) {
  const liveStream = await liveStreamService.getLiveStreamById(req.params.id);
  if (!liveStream) {
    return res.status(404).json({ message: 'Live stream not found' });
  }
  res.json(liveStream);
}

async function create(req, res) {
  const liveStream = await liveStreamService.createLiveStream(req.body);
  res.status(201).json(liveStream);
}

async function connect(req, res) {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ message: 'username is required' });
  }

  const cleanUsername = String(username).trim().replace(/^@/, '');
  if (!USERNAME_PATTERN.test(cleanUsername)) {
    return res.status(400).json({ message: `Định dạng username không hợp lệ: "${username}"` });
  }

  try {
    const state = await liveStreamService.connectToLiveStream(cleanUsername);
    res.json({ username: cleanUsername, roomId: state.roomId });
  } catch (err) {
    const { status, message } = mapConnectError(cleanUsername, err);
    res.status(status).json({ message });
  }
}

/**
 * Maps tiktok-live-connector's error types to the distinct, user-facing
 * failure reasons FR-05 requires (unknown user, not currently live, rate
 * limited, network/other) instead of one generic message for everything.
 */
function mapConnectError(username, err) {
  // InvalidUniqueIdError: malformed input caught client-side (rare, our own
  // USERNAME_PATTERN check above should already catch this first).
  // InvalidResponseCompositeError: the realistic "no such account" case --
  // every room-id-resolution source (HTML/API/Euler) came back empty.
  if (err instanceof InvalidUniqueIdError || err instanceof InvalidResponseCompositeError) {
    return { status: 404, message: `Không tìm thấy tài khoản @${username}` };
  }
  if (err instanceof UserOfflineError) {
    return { status: 409, message: `Tài khoản @${username} hiện không phát trực tiếp` };
  }
  if (err instanceof SignatureRateLimitError) {
    return { status: 429, message: 'Bị nền tảng giới hạn tần suất, vui lòng thử lại sau ít phút' };
  }
  if (err instanceof ConnectTimeoutError) {
    return { status: 504, message: 'Kết nối quá thời gian chờ, vui lòng kiểm tra mạng và thử lại' };
  }
  return { status: 502, message: err.message || `Không thể kết nối tới LIVE của @${username}` };
}

async function disconnect(req, res) {
  const disconnected = await liveStreamService.disconnectCurrentLiveStream();
  res.json({ disconnected });
}

module.exports = { getAll, getById, create, connect, disconnect };
