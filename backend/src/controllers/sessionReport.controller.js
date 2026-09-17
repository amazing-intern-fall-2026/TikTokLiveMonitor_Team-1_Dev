const sessionReportRepository = require('../repositories/sessionReport.repository');

/** FR-38: re-read a session's summary report (generated once, at disconnect -- see sessionReport.service.js). */
async function getBySessionId(req, res) {
  const report = await sessionReportRepository.findBySessionId(req.params.sessionId);
  if (!report) {
    return res.status(404).json({ message: 'No report found for this session (either it does not exist, or is still running)' });
  }
  res.json(report);
}

module.exports = { getBySessionId };
