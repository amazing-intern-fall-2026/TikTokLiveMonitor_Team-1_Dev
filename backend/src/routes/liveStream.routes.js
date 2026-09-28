const { Router } = require('express');
const liveStreamController = require('../controllers/liveStream.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', liveStreamController.getAll);
router.get('/:id', liveStreamController.getById);
// NFR-SEC-01: creating a live-stream record is an operator action; listing
// is read-only and stays open.
router.post('/', requireAuth, liveStreamController.create);

module.exports = router;
