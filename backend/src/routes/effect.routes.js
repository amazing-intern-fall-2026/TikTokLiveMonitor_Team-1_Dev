const { Router } = require('express');
const effectController = require('../controllers/effect.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

// NFR-SEC-01: kill-switch/pause/resume actuate real effects on the live
// stream -- require an authenticated operator. Status is read-only.
router.post('/kill-switch', requireAuth, effectController.killSwitch);
router.post('/pause', requireAuth, effectController.pauseEffects);
router.post('/resume', requireAuth, effectController.resumeEffects);
router.get('/status', effectController.getEffectStatus);

module.exports = router;