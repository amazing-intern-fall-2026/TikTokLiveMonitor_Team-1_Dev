const { Router } = require('express');
const authController = require('../controllers/auth.controller');

const router = Router();

router.post('/login', authController.login);
// NFR-SEC-02: machine-to-machine token for the /game Socket.io namespace --
// see docs/api/game-token-spec.md.
router.post('/game-token', authController.gameToken);

module.exports = router;
