const crypto = require('crypto');
const { userIdPepper } = require('../config/env');

// NFR-SEC-04/06: tiktok_user_id is personal data under Decree 13/2023, so it
// is pseudonymized with HMAC-SHA256 before it ever reaches Postgres (see
// docs/api/userid-pseudonymization-policy.md, section 4). Fail fast at
// startup rather than silently storing plaintext ids if the pepper is unset.
if (!userIdPepper) {
  throw new Error('USER_ID_PEPPER env var is required to pseudonymize tiktok_user_id');
}

/** Deterministic (same id -> same hash), so ON CONFLICT (tiktok_user_id) still works. */
function hashUserId(tiktokUserId) {
  return crypto.createHmac('sha256', userIdPepper).update(String(tiktokUserId)).digest('hex');
}

/**
 * Bulk upsert for AsyncEventBatcher flushes -- `client` is the transaction
 * client the flush owns (see eventBatch.service.js), so this participates in
 * the same COMMIT/ROLLBACK as the events/payloads it's building app_user_id
 * FKs for. `users` must already be de-duplicated by tiktokUserId: a single
 * INSERT ... ON CONFLICT DO UPDATE statement errors if it would update the
 * same conflicting row twice.
 *
 * Only the HMAC of each id is stored (never the raw id). The returned Map is
 * keyed by the RAW tiktokUserId the caller passed in, so callers never need
 * to know about hashing.
 */
async function bulkUpsert(client, users) {
  if (users.length === 0) {
    return new Map();
  }

  const rawIdByHash = new Map();
  const values = [];
  const placeholders = users.map((u, i) => {
    const hashed = hashUserId(u.tiktokUserId);
    rawIdByHash.set(hashed, u.tiktokUserId);
    const base = i * 3;
    values.push(hashed, u.username ?? null, u.nickname ?? null);
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

  return new Map(result.rows.map((row) => [rawIdByHash.get(row.tiktok_user_id), row.id]));
}

module.exports = { bulkUpsert, hashUserId };
