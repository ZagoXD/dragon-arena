#ifndef PRIVATE_CHAT_REPOSITORY_H
#define PRIVATE_CHAT_REPOSITORY_H

#include "../database/Database.h"
#include <optional>
#include <string>
#include <vector>

struct PrivateMessageRecord {
    long long id = 0;
    long long senderId = 0;
    long long recipientId = 0;
    std::string body;
    long long createdAtMs = 0;
    bool read = false;
};

class PrivateChatRepository {
private:
    Database& database;

    std::optional<PrivateMessageRecord> mapMessage(const DatabaseQueryResult& result) const;

public:
    explicit PrivateChatRepository(Database& database);

    std::optional<PrivateMessageRecord> findLastMessageBetween(long long firstUserId, long long secondUserId, std::string* error = nullptr) const;
    std::vector<PrivateMessageRecord> listConversationMessages(long long firstUserId, long long secondUserId, int limit = 50, std::string* error = nullptr) const;
    int countUnreadMessages(long long recipientId, long long senderId, std::string* error = nullptr) const;
    bool createMessage(long long senderId, long long recipientId, const std::string& body, PrivateMessageRecord* outMessage = nullptr, std::string* error = nullptr);
    bool markConversationRead(long long recipientId, long long senderId, std::string* error = nullptr);
    bool cleanupExpired(int retentionDays, std::string* error = nullptr);
};

#endif
