#ifndef MODERATION_REPOSITORY_H
#define MODERATION_REPOSITORY_H

#include "../database/Database.h"
#include <optional>
#include <string>

struct ActiveBanRecord {
    long long id = 0;
    long long userId = 0;
    long long bannedByUserId = 0;
    long long revokedByUserId = 0;
    bool isPermanent = false;
    long long createdAtMs = 0;
    long long bannedUntilMs = 0;
    long long revokedAtMs = 0;
    std::string reason;
    std::string bannedByNickname;
    std::string bannedByTag;
    std::string revokedByNickname;
    std::string revokedByTag;
};

class ModerationRepository {
private:
    Database& database;

    std::optional<ActiveBanRecord> mapBan(const DatabaseQueryResult& result) const;

public:
    explicit ModerationRepository(Database& database);

    bool ensureSchema(std::string* error = nullptr);
    std::optional<ActiveBanRecord> findActiveBanByUserId(long long userId, std::string* error = nullptr) const;
    bool createBan(
        long long userId,
        long long bannedByUserId,
        const std::string& reason,
        std::optional<long long> bannedUntilMs,
        bool isPermanent,
        ActiveBanRecord* outBan = nullptr,
        std::string* error = nullptr
    );
    bool revokeActiveBan(
        long long userId,
        long long revokedByUserId,
        ActiveBanRecord* outBan = nullptr,
        std::string* error = nullptr
    );
};

#endif
