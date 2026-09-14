const db = require('../config/db');

function insertEvent({ sessionId, appUserId, eventType, occurredAt }) {
  return db
    .query(
      `INSERT INTO events (session_id, app_user_id, event_type, occurred_at)
       VALUES ($1, $2, $3, COALESCE($4, NOW()))
       RETURNING *`,
      [sessionId, appUserId, eventType, occurredAt ?? null]
    )
    .then((result) => result.rows[0]);
}

async function insertCommentEvent({ sessionId, appUserId, occurredAt, comment }) {
  const event = await insertEvent({ sessionId, appUserId, eventType: 'CHAT', occurredAt });
  await db.query('INSERT INTO comment_payloads (event_id, comment) VALUES ($1, $2)', [event.id, comment ?? '']);
  return event;
}

async function insertGiftEvent({
  sessionId,
  appUserId,
  occurredAt,
  giftId,
  giftName,
  repeatCount,
  diamondCount,
  repeatEnd,
}) {
  const event = await insertEvent({ sessionId, appUserId, eventType: 'GIFT', occurredAt });
  await db.query(
    `INSERT INTO gift_payloads (event_id, gift_id, gift_name, repeat_count, diamond_count, repeat_end)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.id, Number(giftId) || 0, giftName ?? null, repeatCount ?? 1, diamondCount ?? 0, repeatEnd ?? true]
  );
  return event;
}

async function insertJoinEvent({ sessionId, appUserId, occurredAt, viewerCount }) {
  const event = await insertEvent({ sessionId, appUserId, eventType: 'JOIN', occurredAt });
  await db.query('INSERT INTO join_payloads (event_id, viewer_count) VALUES ($1, $2)', [
    event.id,
    viewerCount ?? null,
  ]);
  return event;
}

module.exports = { insertCommentEvent, insertGiftEvent, insertJoinEvent };
