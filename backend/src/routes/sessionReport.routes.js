const { Router } = require('express');
const sessionReportController = require('../controllers/sessionReport.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

// NFR-SEC-01: session reports are operator-facing data.
router.use(requireAuth);

router.get('/', sessionReportController.listSessions);
router.get('/:sessionId/report', sessionReportController.getBySessionId);
router.get('/:sessionId/export', sessionReportController.exportBySessionId);

module.exports = router;