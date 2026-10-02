const { hashUserId } = require('./appUser.repository');

/**
 * NFR-SEC-04/06: the Envelope's `user` carries the plaintext TikTok userId,
 * @handle and nickname. app_users only stores the HMAC of the id, so writing
 * the Envelope verbatim here would bypass that. Allow-list instead of
 * delete-list: `user` is reduced to the same HMAC (joinable to
 * app_users.tiktok_user_id), so a field added to extractUser() later can't
 * leak in by default. The rest of the Envelope is kept as-is.
 */
function sanitizeRawPayload(envelope) {
  if (!envelope || !envelope.user || typeof envelope.user !== 'object') {
    return envelope;
  }
  const { userId } = envelope.user;
  return {
    ...envelope,
    user: { userIdHash: userId == null ? null : hashUserId(userId) },
  };
}

/**
 * Bulk inserts one AsyncEventBatcher flush's worth of raw Envelopes.
 * `ON CONFLICT (event_id) DO NOTHING` replaces the old per-row catch on
 * Postgres error 23505 (unique_violation) -- same FR-19 DB-level dedup
 * backstop, just done for the whole batch in one round trip instead of one
 * try/catch per event.
 */
async function bulkCreate(client, rows) {
  if (rows.length === 0) {
    return;
  }
  const values = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 4;
    // [CLAUDE EDIT 2026-10-02] Code gốc của TaiXN (665c0e7), giữ lại để tham khảo.
    // Lý do sửa: ghi nguyên envelope làm lộ userId/uniqueId/nickname gốc, lách HMAC của app_users (NFR-SEC-04).
    // values.push(r.eventId, r.sessionId ?? null, r.eventType, r.rawPayload);
    values.push(r.eventId, r.sessionId ?? null, r.eventType, sanitizeRawPayload(r.rawPayload));
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });
  await client.query(
    `INSERT INTO raw_live_events (event_id, session_id, event_type, raw_payload)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (event_id) DO NOTHING`,
    values
  );
}

module.exports = { bulkCreate, sanitizeRawPayload };
