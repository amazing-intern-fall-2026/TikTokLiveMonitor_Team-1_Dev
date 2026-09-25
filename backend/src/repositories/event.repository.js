/**
 * Bulk inserts one AsyncEventBatcher flush's events of a single type
 * (CHAT | GIFT | JOIN) and returns their generated ids in the same order as
 * `rows` -- a plain single-statement `INSERT ... VALUES (...), (...) ...`
 * has no trigger on this table to reorder it, so Postgres returns RETURNING
 * rows in input order. Callers zip these ids back onto `rows` to build the
 * matching payload table's insert (see eventBatch.service.js).
 */
async function bulkInsertEvents(client, rows) {
  if (rows.length === 0) {
    return [];
  }

  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 4;
    values.push(r.sessionId, r.appUserId, r.eventType, r.occurredAt ?? null);
    return `($${base + 1}, $${base + 2}, $${base + 3}, COALESCE($${base + 4}, NOW()))`;
  });

  const result = await client.query(
    `INSERT INTO events (session_id, app_user_id, event_type, occurred_at)
     VALUES ${placeholders.join(', ')}
     RETURNING id`,
    values
  );

  return result.rows.map((row) => row.id);
}

async function bulkInsertCommentPayloads(client, rows) {
  if (rows.length === 0) {
    return;
  }
  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 2;
    values.push(r.eventId, r.comment ?? '');
    return `($${base + 1}, $${base + 2})`;
  });
  await client.query(`INSERT INTO comment_payloads (event_id, comment) VALUES ${placeholders.join(', ')}`, values);
}

async function bulkInsertGiftPayloads(client, rows) {
  if (rows.length === 0) {
    return;
  }
  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 6;
    values.push(r.eventId, Number(r.giftId) || 0, r.giftName ?? null, r.repeatCount ?? 1, r.diamondCount ?? 0, r.repeatEnd ?? true);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });
  await client.query(
    `INSERT INTO gift_payloads (event_id, gift_id, gift_name, repeat_count, diamond_count, repeat_end)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

async function bulkInsertJoinPayloads(client, rows) {
  if (rows.length === 0) {
    return;
  }
  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 2;
    values.push(r.eventId, r.viewerCount ?? null);
    return `($${base + 1}, $${base + 2})`;
  });
  await client.query(`INSERT INTO join_payloads (event_id, viewer_count) VALUES ${placeholders.join(', ')}`, values);
}

module.exports = { bulkInsertEvents, bulkInsertCommentPayloads, bulkInsertGiftPayloads, bulkInsertJoinPayloads };
