#ifndef FRIENDSHIP_REPOSITORY_H
#define FRIENDSHIP_REPOSITORY_H

#include "../database/Database.h"
#include <optional>
#include <string>
#include <vector>

struct FriendshipSummary {
    long long userId = 0;
    std::string nickname;
    std::string tag;
};

struct FriendRequestSummary {
    long long requestId = 0;
    long long requesterId = 0;
    long long addresseeId = 0;
    std::string nickname;
    std::string tag;
};

struct FriendshipLinkRecord {
    long long id = 0;
    long long requesterId = 0;
    long long addresseeId = 0;
    std::string status;
};

class FriendshipRepository {
private:
    Database& database;

    std::optional<FriendshipLinkRecord> mapLink(const DatabaseQueryResult& result) const;

public:
    explicit FriendshipRepository(Database& database);

    bool ensureSchema(std::string* error = nullptr);
    std::optional<FriendshipLinkRecord> findExistingLink(long long firstUserId, long long secondUserId, std::string* error = nullptr) const;
    std::optional<FriendshipLinkRecord> findPendingIncomingRequest(long long requestId, long long addresseeId, std::string* error = nullptr) const;
    std::optional<FriendshipLinkRecord> findPendingOutgoingRequest(long long requestId, long long requesterId, std::string* error = nullptr) const;
    std::optional<FriendshipLinkRecord> findAcceptedLink(long long firstUserId, long long secondUserId, std::string* error = nullptr) const;
    bool createPendingRequest(long long requesterId, long long addresseeId, FriendshipLinkRecord* outLink = nullptr, std::string* error = nullptr);
    bool updateRequestStatus(long long requestId, const std::string& status, FriendshipLinkRecord* outLink = nullptr, std::string* error = nullptr);
    bool deleteLink(long long requestId, std::string* error = nullptr);
    std::vector<FriendshipSummary> listAcceptedFriends(long long userId, std::string* error = nullptr) const;
    std::vector<FriendRequestSummary> listIncomingRequests(long long userId, std::string* error = nullptr) const;
    std::vector<FriendRequestSummary> listOutgoingRequests(long long userId, std::string* error = nullptr) const;
    std::vector<long long> listAcceptedFriendIds(long long userId, std::string* error = nullptr) const;
};

#endif
