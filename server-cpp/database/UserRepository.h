#ifndef USER_REPOSITORY_H
#define USER_REPOSITORY_H

#include "Database.h"
#include <optional>
#include <string>
#include <vector>

struct UserRecord {
    long long id = 0;
    std::string email;
    std::string username;
    std::string nickname;
    std::string tag;
    std::string role = "player";
    std::string passwordHash;
    std::string createdAt;
};

struct PlayerProfileRecord {
    long long userId = 0;
    int level = 1;
    int xp = 0;
    int coins = 0;
};

struct UserWithProfile {
    UserRecord user;
    PlayerProfileRecord profile;
};

struct CreateUserRequest {
    std::string email;
    std::string username;
    std::string nickname;
    std::string tag;
    std::string passwordHash;
};

class UserRepository {
private:
    Database& database;

    std::optional<UserRecord> mapUser(const DatabaseQueryResult& result) const;
    std::optional<PlayerProfileRecord> mapProfile(const DatabaseQueryResult& result) const;

public:
    explicit UserRepository(Database& database);

    std::optional<UserRecord> findById(long long id, std::string* error = nullptr) const;
    std::optional<UserRecord> findByEmail(const std::string& email, std::string* error = nullptr) const;
    std::optional<UserRecord> findByUsername(const std::string& username, std::string* error = nullptr) const;
    std::optional<UserRecord> findByNickname(const std::string& nickname, std::string* error = nullptr) const;
    std::optional<UserRecord> findByNicknameAndTag(const std::string& nickname, const std::string& tag, std::string* error = nullptr) const;
    std::optional<UserRecord> findByEmailOrUsername(const std::string& value, std::string* error = nullptr) const;
    std::optional<PlayerProfileRecord> findProfileByUserId(long long userId, std::string* error = nullptr) const;
    std::vector<std::string> listTagsByNickname(const std::string& nickname, std::string* error = nullptr) const;

    bool createUser(const CreateUserRequest& request, UserRecord* outUser, std::string* error = nullptr);
    bool updatePasswordHash(long long userId, const std::string& passwordHash, std::string* error = nullptr);
    bool ensureRoleSchema(std::string* error = nullptr);
    bool updateRoleByEmailOrUsername(const std::string& value, const std::string& role, std::string* error = nullptr);
    bool createInitialProfile(long long userId, PlayerProfileRecord* outProfile, std::string* error = nullptr);
    bool createUserWithInitialProfile(
        const CreateUserRequest& request,
        UserWithProfile* outRecord,
        std::string* error = nullptr
    );

    long long countUsers(std::string* error = nullptr) const;
};

#endif
