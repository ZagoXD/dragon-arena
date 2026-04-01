#ifndef ARENA_CHAT_REPOSITORY_H
#define ARENA_CHAT_REPOSITORY_H

#include "../database/Database.h"
#include <optional>
#include <string>
#include <vector>

struct ArenaMessageRecord {
    long long id = 0;
    std::string arenaKey;
    long long senderUserId = 0;
    std::string senderNickname;
    std::string senderTag;
    std::string messageType;
    std::string body;
    long long targetUserId = 0;
    long long createdAtMs = 0;
};

class ArenaChatRepository {
private:
    Database& database;

    std::optional<ArenaMessageRecord> mapMessage(const DatabaseQueryResult& result) const;

public:
    explicit ArenaChatRepository(Database& database);

    std::vector<ArenaMessageRecord> listRecentMessages(
        const std::string& arenaKey,
        int limit = 30,
        std::string* error = nullptr
    ) const;
    bool createMessage(
        const std::string& arenaKey,
        long long senderUserId,
        const std::string& senderNickname,
        const std::string& senderTag,
        const std::string& messageType,
        const std::string& body,
        std::optional<long long> targetUserId = std::nullopt,
        ArenaMessageRecord* outMessage = nullptr,
        std::string* error = nullptr
    );
    bool cleanupExpired(int retentionMinutes, std::string* error = nullptr);
};

#endif
