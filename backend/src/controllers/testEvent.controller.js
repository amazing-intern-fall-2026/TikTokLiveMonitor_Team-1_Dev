const { broadcastEvent } = require('../sockets/socket.service');

function testChat(req, res) {
  const data = {
    userId: req.body.userId || 'test_user',
    nickname: req.body.nickname || 'Test User',
    comment: req.body.comment || 'hello',
    timestamp: Math.floor(Date.now() / 1000)
  };

  broadcastEvent('CHAT', data);

  res.json({
    event: 'CHAT',
    data
  });
}

function testGift(req, res) {
  const data = {
    userId: req.body.userId || 'test_user',
    nickname: req.body.nickname || 'Test User',
    giftId: req.body.giftId || 5655,
    giftName: req.body.giftName || 'Rose',
    repeatCount: req.body.repeatCount || 10,
    diamondCount: req.body.diamondCount || 1
  };

  broadcastEvent('GIFT', data);

  res.json({
    event: 'GIFT',
    data
  });
}

function testMemberJoin(req, res) {
  const data = {
    nickname: req.body.nickname || 'Test User',
    timestamp: Math.floor(Date.now() / 1000)
  };

  broadcastEvent('MEMBER_JOIN', data);

  res.json({
    event: 'MEMBER_JOIN',
    data
  });
}

module.exports = {
  testChat,
  testGift,
  testMemberJoin
};