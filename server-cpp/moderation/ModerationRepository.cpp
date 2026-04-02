#include "ModerationRepository.h"

namespace {
    long long parseLongLong(const std::optional<std::string>& value) {
        if (!value.has_value() || value->empty()) {
            return 0;
        }

        return std::stoll(*value);
    }

    bool parseBool(const std::optional<std::string>& value) {
        if (!value.has_value()) {
            return false;
        }

        return *value == "t" || *value == "true" || *value == "1";
    }
}

ModerationRepository::ModerationRepository(Database& database)
    : database(database) {}

std::optional<ActiveBanRecord> ModerationRepository::mapBan(const DatabaseQueryResult& result) const {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    ActiveBanRecord ban;
    ban.id = parseLongLong(row.get("id"));
    ban.userId = parseLongLong(row.get("user_id"));
    ban.bannedByUserId = parseLongLong(row.get("banned_by_user_id"));
    ban.revokedByUserId = parseLongLong(row.get("revoked_by_user_id"));
    ban.isPermanent = parseBool(row.get("is_permanent"));
    ban.createdAtMs = parseLongLong(row.get("created_at_ms"));
    ban.bannedUntilMs = parseLongLong(row.get("banned_until_ms"));
    ban.revokedAtMs = parseLongLong(row.get("revoked_at_ms"));
    ban.reason = row.get("reason").value_or("");
    ban.bannedByNickname = row.get("banned_by_nickname").value_or("");
    ban.bannedByTag = row.get("banned_by_tag").value_or("");
    ban.revokedByNickname = row.get("revoked_by_nickname").value_or("");
    ban.revokedByTag = row.get("revoked_by_tag").value_or("");
    return ban;
}

bool ModerationRepository::ensureSchema(std::string* error) {
    DatabaseQueryResult result = database.execute(
        "CREATE TABLE IF NOT EXISTS user_bans ("
        " id BIGSERIAL PRIMARY KEY,"
        " user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " banned_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " reason TEXT NOT NULL,"
        " is_permanent BOOLEAN NOT NULL DEFAULT FALSE,"
        " banned_until TIMESTAMPTZ NULL,"
        " created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        " revoked_at TIMESTAMPTZ NULL,"
        " revoked_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,"
        " CHECK (user_id <> banned_by_user_id),"
        " CHECK ((is_permanent = TRUE AND banned_until IS NULL) OR (is_permanent = FALSE AND banned_until IS NOT NULL))"
        ")"
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    DatabaseQueryResult userIndex = database.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON user_bans(user_id)"
    );
    if (!userIndex.ok) {
        if (error != nullptr) {
            *error = userIndex.error;
        }
        return false;
    }

    DatabaseQueryResult activeIndex = database.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_bans_active_lookup ON user_bans(user_id, revoked_at, banned_until)"
    );
    if (!activeIndex.ok) {
        if (error != nullptr) {
            *error = activeIndex.error;
        }
        return false;
    }

    return true;
}

std::optional<ActiveBanRecord> ModerationRepository::findActiveBanByUserId(long long userId, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT ub.id, ub.user_id, ub.banned_by_user_id, ub.revoked_by_user_id, ub.reason, ub.is_permanent, "
        " FLOOR(EXTRACT(EPOCH FROM ub.created_at) * 1000)::bigint AS created_at_ms, "
        " COALESCE(FLOOR(EXTRACT(EPOCH FROM ub.banned_until) * 1000)::bigint, 0) AS banned_until_ms, "
        " COALESCE(FLOOR(EXTRACT(EPOCH FROM ub.revoked_at) * 1000)::bigint, 0) AS revoked_at_ms, "
        " banned_by.nickname AS banned_by_nickname, banned_by.tag AS banned_by_tag, "
        " revoked_by.nickname AS revoked_by_nickname, revoked_by.tag AS revoked_by_tag "
        "FROM user_bans ub "
        "JOIN users banned_by ON banned_by.id = ub.banned_by_user_id "
        "LEFT JOIN users revoked_by ON revoked_by.id = ub.revoked_by_user_id "
        "WHERE ub.user_id = $1 "
        "  AND ub.revoked_at IS NULL "
        "  AND (ub.is_permanent = TRUE OR ub.banned_until > NOW()) "
        "ORDER BY ub.created_at DESC "
        "LIMIT 1",
        {std::to_string(userId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapBan(result);
}

bool ModerationRepository::createBan(
    long long userId,
    long long bannedByUserId,
    const std::string& reason,
    std::optional<long long> bannedUntilMs,
    bool isPermanent,
    ActiveBanRecord* outBan,
    std::string* error
) {
    DatabaseQueryResult result;
    if (isPermanent) {
        result = database.execute(
            "INSERT INTO user_bans (user_id, banned_by_user_id, reason, is_permanent, banned_until) "
            "VALUES ($1, $2, $3, TRUE, NULL) "
            "RETURNING id",
            {
                std::to_string(userId),
                std::to_string(bannedByUserId),
                reason
            }
        );
    } else {
        if (!bannedUntilMs.has_value()) {
            if (error != nullptr) {
                *error = "Temporary bans require bannedUntilMs";
            }
            return false;
        }

        result = database.execute(
            "INSERT INTO user_bans (user_id, banned_by_user_id, reason, is_permanent, banned_until) "
            "VALUES ($1, $2, $3, FALSE, TO_TIMESTAMP(($4::bigint)::double precision / 1000.0)) "
            "RETURNING id",
            {
                std::to_string(userId),
                std::to_string(bannedByUserId),
                reason,
                std::to_string(*bannedUntilMs)
            }
        );
    }

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<ActiveBanRecord> created = findActiveBanByUserId(userId, error);
    if (!created.has_value()) {
        if (error != nullptr && error->empty()) {
            *error = "Ban insert returned no rows";
        }
        return false;
    }

    if (outBan != nullptr) {
        *outBan = *created;
    }

    return true;
}

bool ModerationRepository::revokeActiveBan(
    long long userId,
    long long revokedByUserId,
    ActiveBanRecord* outBan,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "UPDATE user_bans "
        "SET revoked_at = NOW(), revoked_by_user_id = $2 "
        "WHERE id = ("
        "  SELECT id FROM user_bans "
        "  WHERE user_id = $1 "
        "    AND revoked_at IS NULL "
        "    AND (is_permanent = TRUE OR banned_until > NOW()) "
        "  ORDER BY created_at DESC "
        "  LIMIT 1"
        ") "
        "RETURNING id",
        {std::to_string(userId), std::to_string(revokedByUserId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    if (result.affectedRows <= 0) {
        if (error != nullptr) {
            *error = "Ban revoke affected no rows";
        }
        return false;
    }

    DatabaseQueryResult latestResult = database.execute(
        "SELECT ub.id, ub.user_id, ub.banned_by_user_id, ub.revoked_by_user_id, ub.reason, ub.is_permanent, "
        " FLOOR(EXTRACT(EPOCH FROM ub.created_at) * 1000)::bigint AS created_at_ms, "
        " COALESCE(FLOOR(EXTRACT(EPOCH FROM ub.banned_until) * 1000)::bigint, 0) AS banned_until_ms, "
        " COALESCE(FLOOR(EXTRACT(EPOCH FROM ub.revoked_at) * 1000)::bigint, 0) AS revoked_at_ms, "
        " banned_by.nickname AS banned_by_nickname, banned_by.tag AS banned_by_tag, "
        " revoked_by.nickname AS revoked_by_nickname, revoked_by.tag AS revoked_by_tag "
        "FROM user_bans ub "
        "JOIN users banned_by ON banned_by.id = ub.banned_by_user_id "
        "LEFT JOIN users revoked_by ON revoked_by.id = ub.revoked_by_user_id "
        "WHERE ub.user_id = $1 "
        "ORDER BY ub.created_at DESC "
        "LIMIT 1",
        {std::to_string(userId)}
    );

    if (!latestResult.ok) {
        if (error != nullptr) {
            *error = latestResult.error;
        }
        return false;
    }

    std::optional<ActiveBanRecord> revoked = mapBan(latestResult);
    if (!revoked.has_value()) {
        if (error != nullptr) {
            *error = "Revoked ban lookup returned no rows";
        }
        return false;
    }

    if (outBan != nullptr) {
        *outBan = *revoked;
    }

    return true;
}
