const { Router } = require('express');
const liveStreamController = require('../controllers/liveStream.controller');

const router = Router();

router.post('/connect', liveStreamController.connect);
router.post('/disconnect', liveStreamController.disconnect);

module.exports = router;
