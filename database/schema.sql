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

CREATE TABLE IF NOT EXISTS chat_events (
    id BIGSERIAL PRIMARY KEY,
    live_stream_id INTEGER NOT NULL REFERENCES live_streams(id),
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    user_id VARCHAR(255) NOT NULL,
    nickname VARCHAR(255),
    comment TEXT NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_events_live_stream_id ON chat_events(live_stream_id, sent_at);
CREATE INDEX idx_chat_events_session_id ON chat_events(session_id, sent_at);

CREATE TABLE IF NOT EXISTS gift_events (
    id BIGSERIAL PRIMARY KEY,
    live_stream_id INTEGER NOT NULL REFERENCES live_streams(id),
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    user_id VARCHAR(255) NOT NULL,
    nickname VARCHAR(255),
    gift_id INTEGER NOT NULL,
    gift_name VARCHAR(255),
    repeat_count INTEGER NOT NULL DEFAULT 1,
    diamond_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gift_events_live_stream_id ON gift_events(live_stream_id, sent_at);
CREATE INDEX idx_gift_events_session_id ON gift_events(session_id, sent_at);

-- user_id is nullable: TikTok's member-join event does not always carry it.
CREATE TABLE IF NOT EXISTS join_events (
    id BIGSERIAL PRIMARY KEY,
    live_stream_id INTEGER NOT NULL REFERENCES live_streams(id),
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    user_id VARCHAR(255),
    nickname VARCHAR(255),
    joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_join_events_live_stream_id ON join_events(live_stream_id, joined_at);
CREATE INDEX idx_join_events_session_id ON join_events(session_id, joined_at);
