const { Router } = require('express');
const effectController = require('../controllers/effect.controller');

const router = Router();

router.post('/kill-switch', effectController.killSwitch);

module.exports = router;
