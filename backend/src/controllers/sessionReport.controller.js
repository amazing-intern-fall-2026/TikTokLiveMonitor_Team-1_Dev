const sessionRepository = require('../repositories/session.repository');
const sessionReportRepository = require('../repositories/sessionReport.repository');

/** FR-38: liệt kê các phiên ĐÃ ĐÓNG (đã có report), phân trang, phục vụ modal "Lịch sử phiên". Phiên đang chạy (disconnected_at NULL) không xuất hiện -- chưa có gì để xem/tải. */
async function listSessions(req, res) {
  const page = req.query.page === undefined ? 1 : Number.parseInt(req.query.page, 10);
  const pageSize = req.query.pageSize === undefined ? 20 : Number.parseInt(req.query.pageSize, 10);
  if (!Number.isInteger(page) || !Number.isInteger(pageSize) || page < 1 || pageSize < 1) {
    return res.status(400).json({ message: 'page và pageSize phải là số nguyên dương' });
  }

  const { room, dateFrom, dateTo } = req.query;
  const result = await sessionReportRepository.listClosedSessions({ page, pageSize, room, dateFrom, dateTo });
  res.json({
    sessions: result.sessions,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
  });
}

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


const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v);

/** FR-38: GET /api/sessions?page=&limit=&host=&liveStreamId=&from=&to= -- paginated session history. */
async function list(req, res) {
  const { host, liveStreamId, from, to } = req.query;
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);

  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ message: 'page must be a positive integer' });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ message: 'limit must be an integer between 1 and 100' });
  }
  if (liveStreamId !== undefined && !/^\d+$/.test(liveStreamId)) {
    return res.status(400).json({ message: 'liveStreamId must be a positive integer' });
  }
  for (const [name, value] of [['from', from], ['to', to]]) {
    if (value !== undefined && !isValidDate(value)) {
      return res.status(400).json({ message: `${name} must be a valid date in YYYY-MM-DD format` });
    }
  }
  if (from && to && from > to) {
    return res.status(400).json({ message: 'from must not be after to' });
  }

  const { rows, total } = await sessionRepository.findPage({
    hostUsername: host ? String(host).trim().replace(/^@/, '') : undefined,
    liveStreamId: liveStreamId ? Number(liveStreamId) : undefined,
    from,
    to,
    limit,
    offset: (page - 1) * limit,
  });

  res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
}


module.exports = { listSessions, getBySessionId, exportBySessionId, list };
