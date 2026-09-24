/**
 * Bulk upsert for AsyncEventBatcher flushes -- `client` is the transaction
 * client the flush owns (see eventBatch.service.js), so this participates in
 * the same COMMIT/ROLLBACK as the events/payloads it's building app_user_id
 * FKs for. `users` must already be de-duplicated by tiktokUserId: a single
 * INSERT ... ON CONFLICT DO UPDATE statement errors if it would update the
 * same conflicting row twice.
 */
async function bulkUpsert(client, users) {
  if (users.length === 0) {
    return new Map();
  }

  const values = [];
  const placeholders = users.map((u, i) => {
    const base = i * 3;
    values.push(u.tiktokUserId, u.username ?? null, u.nickname ?? null);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });

  const result = await client.query(
    `INSERT INTO app_users (tiktok_user_id, username, nickname)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (tiktok_user_id)
     DO UPDATE SET username = EXCLUDED.username, nickname = EXCLUDED.nickname, last_seen_at = NOW()
     RETURNING tiktok_user_id, id`,
    values
  );

  return new Map(result.rows.map((row) => [row.tiktok_user_id, row.id]));
}

module.exports = { bulkUpsert };
