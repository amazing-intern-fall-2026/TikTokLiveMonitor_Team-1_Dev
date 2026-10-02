const db = require('../config/db');

/** FR-36: persists one session's summary report. session_id is UNIQUE -- a session is only closed once. */
function create({
  sessionId,
  durationSeconds,
  totalComments,
  totalJoins,
  totalGifts,
  totalDiamonds,
  effectsTriggered,
  topContributors,
}) {
  return db
    .query(
      `INSERT INTO session_reports
         (session_id, duration_seconds, total_comments, total_joins, total_gifts, total_diamonds, effects_triggered, top_contributors)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        sessionId,
        durationSeconds,
        totalComments,
        totalJoins,
        totalGifts,
        totalDiamonds,
        JSON.stringify(effectsTriggered),
        JSON.stringify(topContributors),
      ]
    )
    .then((result) => result.rows[0]);
}

/** FR-38: re-read a past session's report without re-aggregating. */
function findBySessionId(sessionId) {
  return db
    .query('SELECT * FROM session_reports WHERE session_id = $1', [sessionId])
    .then((result) => result.rows[0]);
}

/** Session + basic info for computing duration/context, joined to its parent live_stream. */
function findSessionWithStream(sessionId) {
  return db
    .query(
      `SELECT s.*, ls.host_username, ls.title
       FROM sessions s
       JOIN live_streams ls ON ls.id = s.live_stream_id
       WHERE s.id = $1`,
      [sessionId]
    )
    .then((result) => result.rows[0]);
}

// [CLAUDE EDIT 2026-10-02] Code gốc của TaiXN (7462a24), giữ lại để tham khảo.
// Lý do sửa: mỗi tick combo trung gian (repeat_end = FALSE) cũng là 1 dòng events GIFT, nên
// total_gifts đếm 1 combo 10 quà thành ~11 "quà" (BR-GF-01). sumDiamonds/topGifters đã lọc
// repeat_end = TRUE từ trước; giờ total_gifts cũng chỉ đếm quà đã chốt.
// /** FR-36: event counts by type for one session. */
// function countEventsByType(sessionId) {
//   return db
//     .query('SELECT event_type, COUNT(*) AS count FROM events WHERE session_id = $1 GROUP BY event_type', [sessionId])
//     .then((result) => result.rows);
// }

/** FR-36: event counts by type for one session; GIFT counts only finished gifts/streaks (BR-GF-01). */
function countEventsByType(sessionId) {
  return db
    .query(
      `SELECT e.event_type, COUNT(*) AS count
       FROM events e
       LEFT JOIN gift_payloads gp ON gp.event_id = e.id
       WHERE e.session_id = $1 AND (e.event_type <> 'GIFT' OR gp.repeat_end IS NOT FALSE)
       GROUP BY e.event_type`,
      [sessionId]
    )
    .then((result) => result.rows);
}

/** FR-36: total diamonds across every completed gift streak in one session. gift_payloads.diamond_count is the per-unit value, so the total is diamond_count * repeat_count. */
function sumDiamonds(sessionId) {
  return db
    .query(
      `SELECT COALESCE(SUM(gp.diamond_count * gp.repeat_count), 0) AS total
       FROM events e
       JOIN gift_payloads gp ON gp.event_id = e.id
       WHERE e.session_id = $1 AND gp.repeat_end = TRUE`,
      [sessionId]
    )
    .then((result) => Number(result.rows[0].total));
}

/** FR-18/FR-36: top gift-givers by total diamonds, for the session summary. */
function topGifters(sessionId, limit = 5) {
  return db
    .query(
      `SELECT au.username, au.nickname, SUM(gp.diamond_count * gp.repeat_count) AS total_diamonds
       FROM events e
       JOIN gift_payloads gp ON gp.event_id = e.id
       JOIN app_users au ON au.id = e.app_user_id
       WHERE e.session_id = $1 AND gp.repeat_end = TRUE
       GROUP BY au.id, au.username, au.nickname
       ORDER BY total_diamonds DESC
       LIMIT $2`,
      [sessionId, limit]
    )
    .then((result) => result.rows);
}

/** FR-18/FR-36: top commenters by comment count, for the session summary. */
function topCommenters(sessionId, limit = 5) {
  return db
    .query(
      `SELECT au.username, au.nickname, COUNT(*) AS comment_count
       FROM events e
       JOIN app_users au ON au.id = e.app_user_id
       WHERE e.session_id = $1 AND e.event_type = 'CHAT'
       GROUP BY au.id, au.username, au.nickname
       ORDER BY comment_count DESC
       LIMIT $2`,
      [sessionId, limit]
    )
    .then((result) => result.rows);
}

/** Analytics warehouse (session_analytics_summary): distinct viewers across every event type in the session, regardless of what they did. */
function countUniqueViewers(sessionId) {
  return db
    .query('SELECT COUNT(DISTINCT app_user_id) AS count FROM events WHERE session_id = $1', [sessionId])
    .then((result) => Number(result.rows[0].count));
}

// NOTE (29/09/2026, Huy Hào): GET /api/sessions (danh sách, phân trang) vốn
// là task riêng của Hoàng Đạt cùng ngày -- viết tạm ở đây để không chặn
// modal "Lịch sử phiên" (Đức Tài) đang phụ thuộc thẳng vào nó. Đạt review
// lại phần lọc/sort/index trước khi coi là xong task của mình.
//
// FR-38 "Lịch sử phiên" = các phiên ĐÃ ĐÓNG (đã có report, tức
// disconnected_at NOT NULL) -- phiên đang chạy không có gì để xem/tải.
// Join thẳng session_reports để trả sẵn vài số liệu tóm tắt cho danh sách
// (khỏi phải gọi thêm 1 request/dòng chỉ để hiển thị bảng).
function listClosedSessions({ page = 1, pageSize = 20, room, dateFrom, dateTo }) {
  const conditions = ['s.disconnected_at IS NOT NULL'];
  const params = [];

  if (room) {
    params.push(`%${room}%`);
    conditions.push(`ls.host_username ILIKE $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`s.connected_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`s.connected_at <= $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const limit = Math.min(Math.max(1, pageSize), 100);
  const offset = (Math.max(1, page) - 1) * limit;

  const listParams = [...params, limit, offset];
  const listSql = `
    SELECT
      s.id AS session_id,
      ls.host_username,
      s.connected_at,
      s.disconnected_at,
      sr.duration_seconds,
      sr.total_comments,
      sr.total_joins,
      sr.total_gifts,
      sr.total_diamonds,
      sr.generated_at
    FROM sessions s
    JOIN live_streams ls ON ls.id = s.live_stream_id
    JOIN session_reports sr ON sr.session_id = s.id
    ${whereClause}
    ORDER BY s.disconnected_at DESC
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;
  const countSql = `
    SELECT COUNT(*) AS count
    FROM sessions s
    JOIN live_streams ls ON ls.id = s.live_stream_id
    JOIN session_reports sr ON sr.session_id = s.id
    ${whereClause}
  `;

  return Promise.all([db.query(listSql, listParams), db.query(countSql, params)]).then(([listResult, countResult]) => ({
    sessions: listResult.rows,
    total: Number(countResult.rows[0].count),
    page: Math.max(1, page),
    pageSize: limit,
  }));
}

module.exports = {
  create,
  findBySessionId,
  findSessionWithStream,
  countEventsByType,
  sumDiamonds,
  topGifters,
  topCommenters,
  countUniqueViewers,
  listClosedSessions,
};
