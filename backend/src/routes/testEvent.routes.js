const { Router } = require('express');
const testEventController = require('../controllers/testEvent.controller');

const router = Router();

router.post('/chat', testEventController.testChat);
router.post('/gift', testEventController.testGift);
router.post('/member-join', testEventController.testMemberJoin);

module.exports = router;