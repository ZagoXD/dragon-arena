#include "PrivateChatRepository.h"
#include <algorithm>

namespace {
    long long parseLongLong(const std::optional<std::string>& value) {
        if (!value.has_value() || value->empty()) {
            return 0;
        }

        return std::stoll(*value);
    }
}

PrivateChatRepository::PrivateChatRepository(Database& database)
    : database(database) {}

std::optional<PrivateMessageRecord> PrivateChatRepository::mapMessage(const DatabaseQueryResult& result) const {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    PrivateMessageRecord message;
    message.id = parseLongLong(row.get("id"));
    message.senderId = parseLongLong(row.get("sender_id"));
    message.recipientId = parseLongLong(row.get("recipient_id"));
    message.body = row.get("body").value_or("");
    message.createdAtMs = parseLongLong(row.get("created_at_ms"));
    message.read = row.get("read_at").has_value() && !row.get("read_at")->empty();
    return message;
}

std::optional<PrivateMessageRecord> PrivateChatRepository::findLastMessageBetween(
    long long firstUserId,
    long long secondUserId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, sender_id, recipient_id, body, "
        "       CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms, "
        "       read_at "
        "FROM private_messages "
        "WHERE (sender_id = $1 AND recipient_id = $2) "
        "   OR (sender_id = $2 AND recipient_id = $1) "
        "ORDER BY created_at DESC LIMIT 1",
        {std::to_string(firstUserId), std::to_string(secondUserId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapMessage(result);
}

std::vector<PrivateMessageRecord> PrivateChatRepository::listConversationMessages(
    long long firstUserId,
    long long secondUserId,
    int limit,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, sender_id, recipient_id, body, "
        "       CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms, "
        "       read_at "
        "FROM ("
        "  SELECT id, sender_id, recipient_id, body, created_at, read_at "
        "  FROM private_messages "
        "  WHERE (sender_id = $1 AND recipient_id = $2) "
        "     OR (sender_id = $2 AND recipient_id = $1) "
        "  ORDER BY created_at DESC LIMIT $3"
        ") recent_messages "
        "ORDER BY created_at ASC",
        {std::to_string(firstUserId), std::to_string(secondUserId), std::to_string(limit)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<PrivateMessageRecord> messages;
    messages.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        PrivateMessageRecord message;
        message.id = parseLongLong(row.get("id"));
        message.senderId = parseLongLong(row.get("sender_id"));
        message.recipientId = parseLongLong(row.get("recipient_id"));
        message.body = row.get("body").value_or("");
        message.createdAtMs = parseLongLong(row.get("created_at_ms"));
        message.read = row.get("read_at").has_value() && !row.get("read_at")->empty();
        messages.push_back(message);
    }

    return messages;
}

int PrivateChatRepository::countUnreadMessages(
    long long recipientId,
    long long senderId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT COUNT(*) AS unread_count "
        "FROM private_messages "
        "WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL",
        {std::to_string(recipientId), std::to_string(senderId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return 0;
    }

    if (result.rows.empty()) {
        return 0;
    }

    return static_cast<int>(parseLongLong(result.rows.front().get("unread_count")));
}

bool PrivateChatRepository::createMessage(
    long long senderId,
    long long recipientId,
    const std::string& body,
    PrivateMessageRecord* outMessage,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "INSERT INTO private_messages (sender_id, recipient_id, body) "
        "VALUES ($1, $2, $3) "
        "RETURNING id, sender_id, recipient_id, body, "
        "          CAST(EXTRACT(EPOCH FROM created_at) * 1000 AS BIGINT) AS created_at_ms, "
        "          read_at",
        {std::to_string(senderId), std::to_string(recipientId), body}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<PrivateMessageRecord> message = mapMessage(result);
    if (!message.has_value()) {
        if (error != nullptr) {
            *error = "Private message insert returned no rows";
        }
        return false;
    }

    if (outMessage != nullptr) {
        *outMessage = *message;
    }

    return true;
}

bool PrivateChatRepository::markConversationRead(long long recipientId, long long senderId, std::string* error) {
    DatabaseQueryResult result = database.execute(
        "UPDATE private_messages "
        "SET read_at = NOW() "
        "WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL",
        {std::to_string(recipientId), std::to_string(senderId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return result.ok;
}

bool PrivateChatRepository::cleanupExpired(int retentionDays, std::string* error) {
    DatabaseQueryResult result = database.execute(
        "DELETE FROM private_messages "
        "WHERE created_at < NOW() - ($1::text || ' days')::interval",
        {std::to_string(retentionDays)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return result.ok;
}
