const { Router } = require('express');
const liveStreamRoutes = require('./liveStream.routes');
const livestreamConnectionRoutes = require('./livestreamConnection.routes');
const testEventRoutes = require('./testEvent.routes');
const effectRoutes = require('./effect.routes');
const sessionReportRoutes = require('./sessionReport.routes');
const ruleRoutes = require('./rule.routes');
const authRoutes = require('./auth.routes');
const { nodeEnv } = require('../config/env');

const router = Router();

router.use('/live-streams', liveStreamRoutes);
router.use('/livestream', livestreamConnectionRoutes);
// /api/test-events is a dev/QA-only shortcut for injecting fake chat/gift/
// member-join events -- never expose it in production.
if (nodeEnv !== 'production') {
  router.use('/test-events', testEventRoutes);
}
router.use('/effects', effectRoutes);
router.use('/sessions', sessionReportRoutes);
router.use('/rules', ruleRoutes);
router.use('/auth', authRoutes);

module.exports = router;