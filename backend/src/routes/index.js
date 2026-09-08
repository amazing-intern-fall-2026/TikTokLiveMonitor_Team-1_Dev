const { Router } = require('express');
const liveStreamRoutes = require('./liveStream.routes');
const testEventRoutes = require('./testEvent.routes');

const router = Router();

router.use('/live-streams', liveStreamRoutes);
router.use('/test-events', testEventRoutes);

module.exports = router;