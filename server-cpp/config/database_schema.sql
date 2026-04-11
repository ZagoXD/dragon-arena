CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(20) NOT NULL UNIQUE,
    nickname VARCHAR(20) NOT NULL,
    tag VARCHAR(8) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (char_length(username) BETWEEN 3 AND 20),
    CHECK (char_length(nickname) BETWEEN 3 AND 20),
    CHECK (char_length(tag) BETWEEN 2 AND 8),
    CHECK (role IN ('player', 'admin'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_tag
    ON users(nickname, tag);

CREATE INDEX IF NOT EXISTS idx_users_nickname
    ON users(nickname);

CREATE TABLE IF NOT EXISTS player_profiles (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    CHECK (level >= 1),
    CHECK (xp >= 0),
    CHECK (coins >= 0)
);

CREATE TABLE IF NOT EXISTS friendships (
    id BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (requester_id <> addressee_id),
    CHECK (status IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester_id
    ON friendships(requester_id);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id
    ON friendships(addressee_id);

CREATE TABLE IF NOT EXISTS private_messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ NULL,
    CHECK (sender_id <> recipient_id),
    CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_private_messages_participants_created
    ON private_messages(sender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_private_messages_recipient_sender_read
    ON private_messages(recipient_id, sender_id, read_at);

CREATE TABLE IF NOT EXISTS arena_messages (
    id BIGSERIAL PRIMARY KEY,
    arena_key VARCHAR(128) NOT NULL,
    sender_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_nickname VARCHAR(20) NOT NULL,
    sender_tag VARCHAR(8) NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'public',
    body TEXT NOT NULL,
    target_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (message_type IN ('public', 'whisper_in', 'whisper_out', 'system')),
    CHECK (char_length(body) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_arena_messages_arena_created
    ON arena_messages(arena_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_arena_messages_sender_created
    ON arena_messages(sender_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_nickname_snapshot VARCHAR(20) NOT NULL,
    target_tag_snapshot VARCHAR(8) NOT NULL,
    reason_codes TEXT NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    resolved_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    CHECK (reporter_user_id <> target_user_id),
    CHECK (status IN ('open', 'accepted', 'rejected')),
    CHECK (char_length(description) BETWEEN 1 AND 500)
);

CREATE INDEX IF NOT EXISTS idx_player_reports_target_status_created
    ON player_reports(target_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_reports_reporter_created
    ON player_reports(reporter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_bans (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banned_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    banned_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ NULL,
    revoked_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    CHECK (user_id <> banned_by_user_id),
    CHECK (
        (is_permanent = TRUE AND banned_until IS NULL) OR
        (is_permanent = FALSE AND banned_until IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user_id
    ON user_bans(user_id);

CREATE INDEX IF NOT EXISTS idx_user_bans_active_lookup
    ON user_bans(user_id, revoked_at, banned_until);
