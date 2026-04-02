#include "ArenaChatRepository.h"

namespace {
    long long parseLongLong(const std::optional<std::string>& value) {
        if (!value.has_value() || value->empty()) {
            return 0;
        }

        return std::stoll(*value);
    }
}

ArenaChatRepository::ArenaChatRepository(Database& database)
    : database(database) {}

std::optional<ArenaMessageRecord> ArenaChatRepository::mapMessage(const DatabaseQueryResult& result) const {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    ArenaMessageRecord message;
    message.id = parseLongLong(row.get("id"));
    message.arenaKey = row.get("arena_key").value_or("");
    message.senderUserId = parseLongLong(row.get("sender_user_id"));
    message.senderNickname = row.get("sender_nickname").value_or("");
    message.senderTag = row.get("sender_tag").value_or("");
    message.messageType = row.get("message_type").value_or("");
    message.body = row.get("body").value_or("");
    message.targetUserId = parseLongLong(row.get("target_user_id"));
    message.createdAtMs = parseLongLong(row.get("created_at_ms"));
    return message;
}

std::vector<ArenaMessageRecord> ArenaChatRepository::listRecentMessages(
    const std::string& arenaKey,
    int limit,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, arena_key, sender_user_id, sender_nickname, sender_tag, message_type, body, target_user_id, "
        "       CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms "
        "FROM ("
        "  SELECT id, arena_key, sender_user_id, sender_nickname, sender_tag, message_type, body, target_user_id, created_at "
        "  FROM arena_messages "
        "  WHERE arena_key = $1 "
        "  ORDER BY created_at DESC LIMIT $2"
        ") recent_messages "
        "ORDER BY created_at ASC",
        {arenaKey, std::to_string(limit)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<ArenaMessageRecord> messages;
    messages.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        ArenaMessageRecord message;
        message.id = parseLongLong(row.get("id"));
        message.arenaKey = row.get("arena_key").value_or("");
        message.senderUserId = parseLongLong(row.get("sender_user_id"));
        message.senderNickname = row.get("sender_nickname").value_or("");
        message.senderTag = row.get("sender_tag").value_or("");
        message.messageType = row.get("message_type").value_or("");
        message.body = row.get("body").value_or("");
        message.targetUserId = parseLongLong(row.get("target_user_id"));
        message.createdAtMs = parseLongLong(row.get("created_at_ms"));
        messages.push_back(message);
    }

    return messages;
}

std::vector<ArenaMessageRecord> ArenaChatRepository::listRecentMessagesBySender(
    long long senderUserId,
    int minutes,
    int limit,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, arena_key, sender_user_id, sender_nickname, sender_tag, message_type, body, target_user_id, "
        "       CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms "
        "FROM ("
        "  SELECT id, arena_key, sender_user_id, sender_nickname, sender_tag, message_type, body, target_user_id, created_at "
        "  FROM arena_messages "
        "  WHERE sender_user_id = $1 "
        "    AND created_at >= NOW() - ($2::text || ' minutes')::interval "
        "  ORDER BY created_at DESC LIMIT $3"
        ") recent_messages "
        "ORDER BY created_at ASC",
        {std::to_string(senderUserId), std::to_string(minutes), std::to_string(limit)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<ArenaMessageRecord> messages;
    messages.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        ArenaMessageRecord message;
        message.id = parseLongLong(row.get("id"));
        message.arenaKey = row.get("arena_key").value_or("");
        message.senderUserId = parseLongLong(row.get("sender_user_id"));
        message.senderNickname = row.get("sender_nickname").value_or("");
        message.senderTag = row.get("sender_tag").value_or("");
        message.messageType = row.get("message_type").value_or("");
        message.body = row.get("body").value_or("");
        message.targetUserId = parseLongLong(row.get("target_user_id"));
        message.createdAtMs = parseLongLong(row.get("created_at_ms"));
        messages.push_back(message);
    }

    return messages;
}

bool ArenaChatRepository::createMessage(
    const std::string& arenaKey,
    long long senderUserId,
    const std::string& senderNickname,
    const std::string& senderTag,
    const std::string& messageType,
    const std::string& body,
    std::optional<long long> targetUserId,
    ArenaMessageRecord* outMessage,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "INSERT INTO arena_messages (arena_key, sender_user_id, sender_nickname, sender_tag, message_type, body, target_user_id) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7) "
        "RETURNING id, arena_key, sender_user_id, sender_nickname, sender_tag, message_type, body, target_user_id, "
        "          CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms",
        {
            arenaKey,
            std::to_string(senderUserId),
            senderNickname,
            senderTag,
            messageType,
            body,
            targetUserId.has_value() ? std::optional<std::string>(std::to_string(*targetUserId)) : std::nullopt,
        }
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<ArenaMessageRecord> message = mapMessage(result);
    if (!message.has_value()) {
        if (error != nullptr) {
            *error = "Arena message insert returned no rows";
        }
        return false;
    }

    if (outMessage != nullptr) {
        *outMessage = *message;
    }

    return true;
}

bool ArenaChatRepository::cleanupExpired(int retentionMinutes, std::string* error) {
    DatabaseQueryResult result = database.execute(
        "DELETE FROM arena_messages "
        "WHERE created_at < NOW() - ($1::text || ' minutes')::interval",
        {std::to_string(retentionMinutes)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return result.ok;
}
