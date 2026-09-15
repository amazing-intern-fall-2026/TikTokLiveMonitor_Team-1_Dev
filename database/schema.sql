-- TikTok Live Monitor database schema

CREATE TABLE IF NOT EXISTS live_streams (
    id SERIAL PRIMARY KEY,
    host_username VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP,
    viewer_count INTEGER DEFAULT 0,
    deleted_at TIMESTAMP
);

-- One row per monitoring connection to a live_stream (a stream can be
-- reconnected to multiple times if the connector drops and retries).
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    live_stream_id INTEGER NOT NULL REFERENCES live_streams(id),
    connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'connected', -- connected | disconnected | error
    disconnect_reason VARCHAR(255),
    deleted_at TIMESTAMP
);
CREATE INDEX idx_sessions_live_stream_id ON sessions(live_stream_id);

-- A TikTok viewer, identified by TikTok's own user id (stable across name
-- changes). Populated/updated the first time we see them in a chat/gift/join
-- event, so username & nickname reflect the latest value we observed.
CREATE TABLE IF NOT EXISTS app_users (
    id BIGSERIAL PRIMARY KEY,
    tiktok_user_id VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(255),
    nickname VARCHAR(255),
    first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Supertype table for every raw event captured during a session. The actual
-- content lives in exactly one of comment_payloads / join_payloads /
-- gift_payloads, matching event_type (event_id there is both PK and FK).
-- Periodic viewer-count ticks (TikTok's ROOM_USER) are NOT stored as events;
-- they update live_streams.viewer_count directly. JOIN here means an actual
-- member-join (TikTok's MEMBER event), which always carries a user.
CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    app_user_id BIGINT NOT NULL REFERENCES app_users(id),
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CHAT', 'GIFT', 'JOIN')),
    occurred_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_session_id ON events(session_id, occurred_at);
CREATE INDEX idx_events_app_user_id ON events(app_user_id);
CREATE INDEX idx_events_type ON events(session_id, event_type);

CREATE TABLE IF NOT EXISTS comment_payloads (
    event_id BIGINT PRIMARY KEY REFERENCES events(id),
    comment TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS join_payloads (
    event_id BIGINT PRIMARY KEY REFERENCES events(id),
    viewer_count INTEGER
);

CREATE TABLE IF NOT EXISTS gift_payloads (
    event_id BIGINT PRIMARY KEY REFERENCES events(id),
    gift_id INTEGER NOT NULL,
    gift_name VARCHAR(255),
    repeat_count INTEGER NOT NULL DEFAULT 1,
    diamond_count INTEGER NOT NULL DEFAULT 0,
    repeat_end BOOLEAN NOT NULL DEFAULT TRUE
);

-- Config turning live events into game-engine effects (e.g. "every 10 Rose
-- gifts -> trigger fireworks"). Not scoped to a live_stream/session: the same
-- rule set can run across streams, with per-session progress in rule_counters.
CREATE TABLE IF NOT EXISTS rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('CHAT', 'GIFT', 'JOIN')),
    condition JSONB NOT NULL, -- e.g. {"keyword": "GO"} or {"giftId": 5655, "threshold": 10}
    effect JSONB NOT NULL,    -- payload dispatched to the game engine when the rule fires
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);

-- Running counter per (rule, session), for threshold-based rules. Starts
-- fresh for every new session since it's keyed by session_id, not live_stream_id.
CREATE TABLE IF NOT EXISTS rule_counters (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES rules(id),
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    counter_value INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (rule_id, session_id)
);

-- One row per effect dispatched to the game engine/overlay. rule_id and
-- event_id are both nullable: an effect can be triggered manually (e.g. the
-- kill switch, FR-30) instead of by a specific rule/live event.
CREATE TABLE IF NOT EXISTS effect_commands (
    id BIGSERIAL PRIMARY KEY,
    rule_id INTEGER REFERENCES rules(id),
    event_id BIGINT REFERENCES events(id),
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | SENT | ACKED | FAILED
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMP
);
CREATE INDEX idx_effect_commands_rule_id ON effect_commands(rule_id);
CREATE INDEX idx_effect_commands_event_id ON effect_commands(event_id);
CREATE INDEX idx_effect_commands_status ON effect_commands(status);

CREATE TABLE IF NOT EXISTS effect_acks (
    id BIGSERIAL PRIMARY KEY,
    effect_command_id BIGINT NOT NULL REFERENCES effect_commands(id),
    status VARCHAR(20) NOT NULL, -- SUCCESS | FAILED
    message VARCHAR(255),
    acked_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_effect_acks_effect_command_id ON effect_acks(effect_command_id);
