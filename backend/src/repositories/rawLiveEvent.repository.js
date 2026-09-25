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
    values.push(r.eventId, r.sessionId ?? null, r.eventType, r.rawPayload);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });
  await client.query(
    `INSERT INTO raw_live_events (event_id, session_id, event_type, raw_payload)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (event_id) DO NOTHING`,
    values
  );
}

module.exports = { bulkCreate };
