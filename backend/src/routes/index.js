const { Router } = require('express');
const liveStreamRoutes = require('./liveStream.routes');
const livestreamConnectionRoutes = require('./livestreamConnection.routes');
const testEventRoutes = require('./testEvent.routes');

const router = Router();

router.use('/live-streams', liveStreamRoutes);
router.use('/livestream', livestreamConnectionRoutes);
router.use('/test-events', testEventRoutes);

module.exports = router;