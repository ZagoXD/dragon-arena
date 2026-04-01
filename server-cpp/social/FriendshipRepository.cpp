#include "FriendshipRepository.h"

namespace {
    long long parseLongLong(const std::optional<std::string>& value) {
        if (!value.has_value() || value->empty()) {
            return 0;
        }

        return std::stoll(*value);
    }
}

FriendshipRepository::FriendshipRepository(Database& database)
    : database(database) {}

std::optional<FriendshipLinkRecord> FriendshipRepository::mapLink(const DatabaseQueryResult& result) const {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    FriendshipLinkRecord link;
    link.id = parseLongLong(row.get("id"));
    link.requesterId = parseLongLong(row.get("requester_id"));
    link.addresseeId = parseLongLong(row.get("addressee_id"));
    link.status = row.get("status").value_or("");
    return link;
}

bool FriendshipRepository::ensureSchema(std::string* error) {
    DatabaseQueryResult result = database.execute(
        "CREATE TABLE IF NOT EXISTS friendships ("
        " id BIGSERIAL PRIMARY KEY,"
        " requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
        " status VARCHAR(20) NOT NULL DEFAULT 'pending',"
        " created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        " updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        " CHECK (requester_id <> addressee_id)"
        ")"
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    DatabaseQueryResult indexResult = database.execute(
        "CREATE INDEX IF NOT EXISTS idx_friendships_requester_id ON friendships(requester_id)"
    );
    if (!indexResult.ok) {
        if (error != nullptr) {
            *error = indexResult.error;
        }
        return false;
    }

    DatabaseQueryResult addresseeIndexResult = database.execute(
        "CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id ON friendships(addressee_id)"
    );
    if (!addresseeIndexResult.ok) {
        if (error != nullptr) {
            *error = addresseeIndexResult.error;
        }
        return false;
    }

    return true;
}

std::optional<FriendshipLinkRecord> FriendshipRepository::findExistingLink(
    long long firstUserId,
    long long secondUserId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, requester_id, addressee_id, status "
        "FROM friendships "
        "WHERE (requester_id = $1 AND addressee_id = $2) "
        "   OR (requester_id = $2 AND addressee_id = $1) "
        "ORDER BY id DESC LIMIT 1",
        {std::to_string(firstUserId), std::to_string(secondUserId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapLink(result);
}

std::optional<FriendshipLinkRecord> FriendshipRepository::findPendingIncomingRequest(
    long long requestId,
    long long addresseeId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, requester_id, addressee_id, status "
        "FROM friendships "
        "WHERE id = $1 AND addressee_id = $2 AND status = 'pending' "
        "LIMIT 1",
        {std::to_string(requestId), std::to_string(addresseeId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapLink(result);
}

std::optional<FriendshipLinkRecord> FriendshipRepository::findPendingOutgoingRequest(
    long long requestId,
    long long requesterId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, requester_id, addressee_id, status "
        "FROM friendships "
        "WHERE id = $1 AND requester_id = $2 AND status = 'pending' "
        "LIMIT 1",
        {std::to_string(requestId), std::to_string(requesterId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapLink(result);
}

std::optional<FriendshipLinkRecord> FriendshipRepository::findAcceptedLink(
    long long firstUserId,
    long long secondUserId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, requester_id, addressee_id, status "
        "FROM friendships "
        "WHERE ((requester_id = $1 AND addressee_id = $2) "
        "   OR (requester_id = $2 AND addressee_id = $1)) "
        "  AND status = 'accepted' "
        "ORDER BY id DESC LIMIT 1",
        {std::to_string(firstUserId), std::to_string(secondUserId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapLink(result);
}

bool FriendshipRepository::createPendingRequest(
    long long requesterId,
    long long addresseeId,
    FriendshipLinkRecord* outLink,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "INSERT INTO friendships (requester_id, addressee_id, status) "
        "VALUES ($1, $2, 'pending') "
        "RETURNING id, requester_id, addressee_id, status",
        {std::to_string(requesterId), std::to_string(addresseeId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<FriendshipLinkRecord> link = mapLink(result);
    if (!link.has_value()) {
        if (error != nullptr) {
            *error = "Friend request insert returned no rows";
        }
        return false;
    }

    if (outLink != nullptr) {
        *outLink = *link;
    }

    return true;
}

bool FriendshipRepository::updateRequestStatus(
    long long requestId,
    const std::string& status,
    FriendshipLinkRecord* outLink,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "UPDATE friendships "
        "SET status = $2, updated_at = NOW() "
        "WHERE id = $1 "
        "RETURNING id, requester_id, addressee_id, status",
        {std::to_string(requestId), status}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<FriendshipLinkRecord> link = mapLink(result);
    if (!link.has_value()) {
        if (error != nullptr) {
            *error = "Friend request update affected no rows";
        }
        return false;
    }

    if (outLink != nullptr) {
        *outLink = *link;
    }

    return true;
}

bool FriendshipRepository::deleteLink(long long requestId, std::string* error) {
    DatabaseQueryResult result = database.execute(
        "DELETE FROM friendships WHERE id = $1",
        {std::to_string(requestId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    if (result.affectedRows <= 0) {
        if (error != nullptr) {
            *error = "Friendship delete affected no rows";
        }
        return false;
    }

    return true;
}

std::vector<FriendshipSummary> FriendshipRepository::listAcceptedFriends(long long userId, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT u.id AS user_id, u.nickname, u.tag "
        "FROM friendships f "
        "JOIN users u ON u.id = CASE "
        "  WHEN f.requester_id = $1 THEN f.addressee_id "
        "  ELSE f.requester_id "
        "END "
        "WHERE (f.requester_id = $1 OR f.addressee_id = $1) "
        "  AND f.status = 'accepted' "
        "ORDER BY u.nickname ASC, u.tag ASC",
        {std::to_string(userId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<FriendshipSummary> friends;
    friends.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        FriendshipSummary summary;
        summary.userId = parseLongLong(row.get("user_id"));
        summary.nickname = row.get("nickname").value_or("");
        summary.tag = row.get("tag").value_or("");
        friends.push_back(summary);
    }

    return friends;
}

std::vector<FriendRequestSummary> FriendshipRepository::listIncomingRequests(long long userId, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT f.id AS request_id, f.requester_id, u.nickname, u.tag "
        "FROM friendships f "
        "JOIN users u ON u.id = f.requester_id "
        "WHERE f.addressee_id = $1 AND f.status = 'pending' "
        "ORDER BY f.created_at ASC",
        {std::to_string(userId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<FriendRequestSummary> requests;
    requests.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        FriendRequestSummary summary;
        summary.requestId = parseLongLong(row.get("request_id"));
        summary.requesterId = parseLongLong(row.get("requester_id"));
        summary.addresseeId = userId;
        summary.nickname = row.get("nickname").value_or("");
        summary.tag = row.get("tag").value_or("");
        requests.push_back(summary);
    }

    return requests;
}

std::vector<FriendRequestSummary> FriendshipRepository::listOutgoingRequests(long long userId, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT f.id AS request_id, f.addressee_id, u.nickname, u.tag "
        "FROM friendships f "
        "JOIN users u ON u.id = f.addressee_id "
        "WHERE f.requester_id = $1 AND f.status = 'pending' "
        "ORDER BY f.created_at ASC",
        {std::to_string(userId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<FriendRequestSummary> requests;
    requests.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        FriendRequestSummary summary;
        summary.requestId = parseLongLong(row.get("request_id"));
        summary.requesterId = userId;
        summary.addresseeId = parseLongLong(row.get("addressee_id"));
        summary.nickname = row.get("nickname").value_or("");
        summary.tag = row.get("tag").value_or("");
        requests.push_back(summary);
    }

    return requests;
}

std::vector<long long> FriendshipRepository::listAcceptedFriendIds(long long userId, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT CASE "
        "  WHEN requester_id = $1 THEN addressee_id "
        "  ELSE requester_id "
        "END AS friend_user_id "
        "FROM friendships "
        "WHERE (requester_id = $1 OR addressee_id = $1) "
        "  AND status = 'accepted'",
        {std::to_string(userId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return {};
    }

    std::vector<long long> ids;
    ids.reserve(result.rows.size());
    for (const DatabaseRow& row : result.rows) {
        ids.push_back(parseLongLong(row.get("friend_user_id")));
    }

    return ids;
}
