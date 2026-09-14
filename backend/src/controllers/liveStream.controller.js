const liveStreamService = require('../services/liveStream.service');

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

  try {
    const state = await liveStreamService.connectToLiveStream(username);
    res.json({ username, roomId: state.roomId });
  } catch (err) {
    res.status(502).json({ message: err.message || `Failed to connect to @${username}'s LIVE` });
  }
}

async function disconnect(req, res) {
  const disconnected = await liveStreamService.disconnectCurrentLiveStream();
  res.json({ disconnected });
}

module.exports = { getAll, getById, create, connect, disconnect };
