const { Router } = require('express');
const effectController = require('../controllers/effect.controller');

const router = Router();

router.post('/kill-switch', effectController.killSwitch);
router.post('/pause', effectController.pauseEffects);
router.post('/resume', effectController.resumeEffects);
router.get('/status', effectController.getEffectStatus);

module.exports = router;