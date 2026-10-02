#!/usr/bin/env node
/**
 * One-off migration (NFR-SEC-04/06) for data written before pseudonymization
 * reached every table:
 *
 *   1. raw_live_events.raw_payload.user -> { userIdHash } (rows written before
 *      rawLiveEvent.repository.js started sanitizing the Envelope).
 *   2. app_users.tiktok_user_id plaintext -> HMAC (rows written before
 *      d7d4db7). If the same viewer already has a hashed row, the plaintext
 *      row is merged into it (events re-pointed, then deleted) because
 *      tiktok_user_id is UNIQUE.
 *   3. Indexes the retention job relies on (no-op if schema.sql already made them).
 *
 * Irreversible: the plaintext ids are gone afterwards. BACK UP THE DB FIRST:
 *   docker compose exec db pg_dump -U postgres tiktok_live_monitor > backup.sql
 *
 * Usage (from backend/, same USER_ID_PEPPER as the running backend -- a
 * different pepper makes hashes that never match new rows):
 *   node scripts/pseudonymize-existing-data.js --dry-run
 *   node scripts/pseudonymize-existing-data.js
 * Safe to re-run: already-migrated rows are skipped.
 */

const db = require('../src/config/db');
const { hashUserId } = require('../src/repositories/appUser.repository');
const { sanitizeRawPayload } = require('../src/repositories/rawLiveEvent.repository');

const BATCH_SIZE = 1000;
const dryRun = process.argv.includes('--dry-run');

// A raw user object still needs migrating if it has any key besides userIdHash.
const RAW_PENDING_WHERE = `jsonb_typeof(raw_payload->'user') = 'object'
  AND (raw_payload->'user') - 'userIdHash' <> '{}'::jsonb`;
// HMAC-SHA256 hex digest; TikTok's numeric ids (or 'unknown') never look like this.
const APP_USER_PENDING_WHERE = `tiktok_user_id !~ '^[0-9a-f]{64}$'`;

async function count(where, table) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`);
  return rows[0].n;
}

async function migrateRawEvents() {
  let total = 0;
  for (;;) {
    const { rows } = await db.query(
      `SELECT id, raw_payload FROM raw_live_events WHERE ${RAW_PENDING_WHERE} ORDER BY id LIMIT $1`,
      [BATCH_SIZE]
    );
    if (rows.length === 0) {
      return total;
    }
    await db.query(
      `UPDATE raw_live_events r
       SET raw_payload = jsonb_set(r.raw_payload, '{user}', v.u)
       FROM unnest($1::bigint[], $2::jsonb[]) AS v(id, u)
       WHERE r.id = v.id`,
      [rows.map((row) => row.id), rows.map((row) => JSON.stringify(sanitizeRawPayload(row.raw_payload).user))]
    );
    total += rows.length;
  }
}

async function migrateAppUsers() {
  let updated = 0;
  let merged = 0;
  for (;;) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, tiktok_user_id, first_seen_at, last_seen_at FROM app_users
         WHERE ${APP_USER_PENDING_WHERE} ORDER BY id LIMIT $1 FOR UPDATE`,
        [BATCH_SIZE]
      );
      if (rows.length === 0) {
        await client.query('COMMIT');
        return { updated, merged };
      }
      for (const row of rows) {
        const hashed = hashUserId(row.tiktok_user_id);
        const existing = await client.query('SELECT id FROM app_users WHERE tiktok_user_id = $1', [hashed]);
        if (existing.rows.length === 0) {
          await client.query('UPDATE app_users SET tiktok_user_id = $1 WHERE id = $2', [hashed, row.id]);
          updated += 1;
          continue;
        }
        const keepId = existing.rows[0].id;
        await client.query('UPDATE events SET app_user_id = $1 WHERE app_user_id = $2', [keepId, row.id]);
        await client.query(
          `UPDATE app_users
           SET first_seen_at = LEAST(first_seen_at, $2), last_seen_at = GREATEST(last_seen_at, $3)
           WHERE id = $1`,
          [keepId, row.first_seen_at, row.last_seen_at]
        );
        await client.query('DELETE FROM app_users WHERE id = $1', [row.id]);
        merged += 1;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main() {
  const rawPending = await count(RAW_PENDING_WHERE, 'raw_live_events');
  const appUsersPending = await count(APP_USER_PENDING_WHERE, 'app_users');
  console.log(`raw_live_events with plaintext user: ${rawPending}`);
  console.log(`app_users with plaintext tiktok_user_id: ${appUsersPending}`);
  if (dryRun) {
    console.log('--dry-run: nothing changed.');
    return;
  }

  await db.query('CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_raw_live_events_received_at ON raw_live_events(received_at)');
  console.log('Retention indexes ensured.');

  const rawMigrated = await migrateRawEvents();
  console.log(`raw_live_events migrated: ${rawMigrated}`);
  const { updated, merged } = await migrateAppUsers();
  console.log(`app_users hashed in place: ${updated}, merged into an existing hashed row: ${merged}`);
}

main()
  .then(() => db.pool.end())
  .catch(async (err) => {
    console.error('Migration failed:', err.message);
    await db.pool.end().catch(() => {});
    process.exit(1);
  });
