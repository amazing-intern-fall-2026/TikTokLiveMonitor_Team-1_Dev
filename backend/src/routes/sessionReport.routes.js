const { Router } = require('express');
const sessionReportController = require('../controllers/sessionReport.controller');

const router = Router();

router.get('/:sessionId/report', sessionReportController.getBySessionId);
router.get('/:sessionId/export', sessionReportController.exportBySessionId);

module.exports = router;
