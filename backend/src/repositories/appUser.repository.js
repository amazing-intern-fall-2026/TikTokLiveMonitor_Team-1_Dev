const db = require('../config/db');

/**
 * Upserts a viewer keyed by TikTok's stable numeric user id. username/
 * nickname are refreshed on every appearance since either can change
 * between sessions.
 */
function upsert({ tiktokUserId, username, nickname }) {
  return db
    .query(
      `INSERT INTO app_users (tiktok_user_id, username, nickname)
       VALUES ($1, $2, $3)
       ON CONFLICT (tiktok_user_id)
       DO UPDATE SET username = EXCLUDED.username, nickname = EXCLUDED.nickname, last_seen_at = NOW()
       RETURNING *`,
      [tiktokUserId, username ?? null, nickname ?? null]
    )
    .then((result) => result.rows[0]);
}

module.exports = { upsert };
