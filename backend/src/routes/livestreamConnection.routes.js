const { Router } = require('express');
const liveStreamController = require('../controllers/liveStream.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

// NFR-SEC-01: only an authenticated operator can (dis)connect the TikTok
// live listener.
router.post('/connect', requireAuth, liveStreamController.connect);
router.post('/disconnect', requireAuth, liveStreamController.disconnect);

module.exports = router;
