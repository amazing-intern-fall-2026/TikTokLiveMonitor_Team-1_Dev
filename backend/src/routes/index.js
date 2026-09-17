const { Router } = require('express');
const liveStreamRoutes = require('./liveStream.routes');
const livestreamConnectionRoutes = require('./livestreamConnection.routes');
const testEventRoutes = require('./testEvent.routes');
const effectRoutes = require('./effect.routes');
const sessionReportRoutes = require('./sessionReport.routes');

const router = Router();

router.use('/live-streams', liveStreamRoutes);
router.use('/livestream', livestreamConnectionRoutes);
router.use('/test-events', testEventRoutes);
router.use('/effects', effectRoutes);
router.use('/sessions', sessionReportRoutes);

module.exports = router;