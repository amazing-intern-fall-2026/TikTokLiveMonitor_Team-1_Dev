const { broadcastEvent } = require('../sockets/socket.service');
const { wrapEnvelope } = require('../utils/envelope');
const { normalizeText } = require('../utils/text');
const { getGiftTier } = require('../utils/giftTier');
const ruleEngine = require('../services/RuleEngine.service');

function buildUser(body) {
  return {
    userId: body.userId || 'test_user',
    uniqueId: body.uniqueId || body.userId || 'test_user',
    nickname: body.nickname || 'Test User',
  };
}

function testChat(req, res) {
  const text = req.body.comment || 'hello';

  const envelope = wrapEnvelope({
    type: 'COMMENT',
    roomId: req.body.room || 'test_room',
    user: buildUser(req.body),
    payload: {
      text,
      textNormalized: normalizeText(text),
      length: text.length,
      containsKeywords: [],
    },
  });

  broadcastEvent('CHAT', envelope);
  ruleEngine.processEvent(envelope);
  res.json(envelope);
}

function testGift(req, res) {
  const unitDiamondValue = req.body.diamondCount ?? 1;
  const repeatCount = req.body.repeatCount ?? 10;
  const totalDiamondValue = unitDiamondValue * repeatCount;

  const envelope = wrapEnvelope({
    type: 'GIFT',
    roomId: req.body.room || 'test_room',
    user: buildUser(req.body),
    payload: {
      giftId: req.body.giftId || 5655,
      giftName: req.body.giftName || 'Rose',
      unitDiamondValue,
      repeatCount,
      totalDiamondValue,
      isStreakable: req.body.isStreakable ?? true,
      isStreakFinished: req.body.isStreakFinished ?? true,
      giftTier: getGiftTier(totalDiamondValue),
    },
  });

  broadcastEvent('GIFT', envelope);
  ruleEngine.processEvent(envelope);
  res.json(envelope);
}

function testMemberJoin(req, res) {
  const envelope = wrapEnvelope({
    type: 'JOIN',
    roomId: req.body.room || 'test_room',
    user: buildUser(req.body),
    payload: {
      isFirstJoinInSession: req.body.isFirstJoinInSession ?? true,
      joinCountInSession: req.body.joinCountInSession ?? 1,
    },
  });

  broadcastEvent('MEMBER_JOIN', envelope);
  ruleEngine.processEvent(envelope);
  res.json(envelope);
}

module.exports = {
  testChat,
  testGift,
  testMemberJoin
};
