const sessionReportRepository = require('../repositories/sessionReport.repository');

/** FR-38: re-read a session's summary report (generated once, at disconnect -- see sessionReport.service.js). */
async function getBySessionId(req, res) {
  const report = await sessionReportRepository.findBySessionId(req.params.sessionId);
  if (!report) {
    return res.status(404).json({ message: 'No report found for this session (either it does not exist, or is still running)' });
  }
  res.json(report);
}

const CSV_FIELDS = [
  'session_id',
  'duration_seconds',
  'total_comments',
  'total_joins',
  'total_gifts',
  'total_diamonds',
  'effects_triggered',
  'top_contributors',
  'generated_at',
];

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** effects_triggered/top_contributors are JSONB arrays/objects -- flattened into one CSV cell each as JSON text, same as the JSON export just re-encoded per field. generated_at is a Date (from pg), not JSONB -- written as ISO 8601 instead of Date's locale-dependent toString(). */
function reportToCsv(report) {
  const row = CSV_FIELDS.map((field) => {
    const value = report[field];
    if (value instanceof Date) {
      return value.toISOString();
    }
    return Array.isArray(value) || (typeof value === 'object' && value !== null) ? JSON.stringify(value) : value;
  });
  return `${CSV_FIELDS.join(',')}\n${row.map(csvEscape).join(',')}\n`;
}

/** FR-37: exports the already-generated session_reports row (FR-36) as JSON (default) or CSV via ?format=. Reuses the same lookup/404 as getBySessionId -- no re-aggregation. */
async function exportBySessionId(req, res) {
  const report = await sessionReportRepository.findBySessionId(req.params.sessionId);
  if (!report) {
    return res.status(404).json({ message: 'No report found for this session (either it does not exist, or is still running)' });
  }

  const format = (req.query.format || 'json').toLowerCase();
  if (format === 'json') {
    return res.json(report);
  }
  if (format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="session-${report.session_id}-report.csv"`);
    return res.send(reportToCsv(report));
  }
  res.status(400).json({ message: `Unsupported format "${format}" -- use "json" or "csv"` });
}

module.exports = { getBySessionId, exportBySessionId };
