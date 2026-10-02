const db = require('../config/db');
const { retentionDays } = require('../config/env');
const { makeLogger } = require('../utils/logger');

const logger = makeLogger('retention');

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Small delay after boot so the first run doesn't compete with startup
// (DB pool warm-up, a LIVE reconnect the operator triggers right away).
const FIRST_RUN_DELAY_MS = 60 * 1000;
// Rows per DELETE; each batch is its own short transaction so a large
// backlog never holds locks on events/raw_live_events for long while the
// AsyncEventBatcher keeps inserting.
const DEFAULT_BATCH_SIZE = 5000;

let timers = [];
let running = false;

/** Parses RETENTION_DAYS: positive integer = days, 0 = disabled, anything else = null (invalid). */
function parseRetentionDays(raw) {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    return null;
  }
  return Number(text);
}

/** Repeats `deleteBatch` until it removes fewer than `batchSize` rows; returns the total. */
async function drain(deleteBatch, batchSize) {
  let total = 0;
  for (;;) {
    const count = await deleteBatch();
    total += count;
    if (count < batchSize) {
      return total;
    }
  }
}

async function inTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * NFR-SEC-04: removes per-viewer data older than `days` days.
 *
 * Deleted: raw_live_events, events + their comment/gift/join payloads, and
 * app_users with no remaining events. Scrubbed, not deleted (the rows are
 * still needed for session history / effect logs, FR-30/38): the viewer
 * @handle+nickname in effect_commands.payload.trigger.topContributor and
 * session_reports.top_contributors. Kept untouched: sessions, live_streams
 * (streamer, not viewer data), rules, session_analytics_summary, and the
 * aggregate columns of session_reports.
 *
 * The cutoff is computed in SQL (NOW() - N days) rather than passed in from
 * JS: every timestamp column here is `TIMESTAMP` (no time zone) filled by
 * NOW(), so comparing against NOW() in the same DB session time zone avoids
 * an off-by-UTC-offset cutoff.
 *
 * @returns {Promise<object>} row counts per step, for the log line
 */
async function runRetention({ days, pool = db.pool, batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`runRetention: days must be a positive integer, got ${days}`);
  }

  const rawEvents = await drain(async () => {
    const result = await pool.query(
      `DELETE FROM raw_live_events
       WHERE id IN (
         SELECT id FROM raw_live_events
         WHERE received_at < NOW() - make_interval(days => $1::int)
         LIMIT $2
       )`,
      [days, batchSize]
    );
    return result.rowCount;
  }, batchSize);

  // events has no ON DELETE CASCADE, so each batch removes the payload rows
  // and unlinks effect_commands.event_id first, in one transaction.
  const events = await drain(
    () =>
      inTransaction(pool, async (client) => {
        const { rows } = await client.query(
          `SELECT id FROM events
           WHERE occurred_at < NOW() - make_interval(days => $1::int)
           ORDER BY id
           LIMIT $2`,
          [days, batchSize]
        );
        if (rows.length === 0) {
          return 0;
        }
        const ids = rows.map((row) => row.id);
        await client.query('DELETE FROM comment_payloads WHERE event_id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM gift_payloads WHERE event_id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM join_payloads WHERE event_id = ANY($1::bigint[])', [ids]);
        await client.query('UPDATE effect_commands SET event_id = NULL WHERE event_id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM events WHERE id = ANY($1::bigint[])', [ids]);
        return ids.length;
      }),
    batchSize
  );

  const appUsers = (
    await pool.query(
      `DELETE FROM app_users u
       WHERE u.last_seen_at < NOW() - make_interval(days => $1::int)
         AND NOT EXISTS (SELECT 1 FROM events e WHERE e.app_user_id = u.id)`,
      [days]
    )
  ).rowCount;

  const effectCommandsScrubbed = (
    await pool.query(
      `UPDATE effect_commands
       SET payload = payload #- '{trigger,topContributor}'
       WHERE created_at < NOW() - make_interval(days => $1::int)
         AND payload->'trigger' ? 'topContributor'`,
      [days]
    )
  ).rowCount;

  const sessionReportsScrubbed = (
    await pool.query(
      `UPDATE session_reports
       SET top_contributors = '{}'::jsonb
       WHERE generated_at < NOW() - make_interval(days => $1::int)
         AND top_contributors <> '{}'::jsonb`,
      [days]
    )
  ).rowCount;

  return { rawEvents, events, appUsers, effectCommandsScrubbed, sessionReportsScrubbed };
}

/** One scheduled run; never throws (a failed run is retried on the next tick). */
async function runScheduled(days) {
  if (running) {
    logger.warn('Previous retention run still in progress, skipping this tick');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const counts = await runRetention({ days });
    logger.info('Retention run finished', { days, durationMs: Date.now() - startedAt, ...counts });
  } catch (err) {
    logger.error('Retention run failed', { days, error: err.message });
  } finally {
    running = false;
  }
}

/** Schedules the daily retention run. Call once at server startup. */
function init() {
  if (timers.length > 0) {
    return;
  }
  const days = parseRetentionDays(retentionDays);
  if (days === null) {
    logger.error(`Invalid RETENTION_DAYS "${retentionDays}" (expected a whole number of days, 0 to disable); retention job NOT started`);
    return;
  }
  if (days === 0) {
    logger.warn('RETENTION_DAYS=0: retention job disabled, per-viewer data is kept indefinitely');
    return;
  }

  // unref(): these timers alone must not keep the process alive on shutdown.
  timers = [
    setTimeout(() => runScheduled(days), FIRST_RUN_DELAY_MS),
    setInterval(() => runScheduled(days), RUN_INTERVAL_MS),
  ];
  timers.forEach((timer) => timer.unref());
  logger.info(`Retention job scheduled: data older than ${days} day(s) is removed daily`);
}

module.exports = { init, runRetention, parseRetentionDays };
