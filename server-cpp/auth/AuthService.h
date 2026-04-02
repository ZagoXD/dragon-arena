#ifndef AUTH_SERVICE_H
#define AUTH_SERVICE_H

#include "../database/UserRepository.h"
#include "../moderation/ModerationRepository.h"
#include <nlohmann/json.hpp>
#include <optional>
#include <string>

struct AuthenticatedUser {
    UserRecord user;
    PlayerProfileRecord profile;
};

struct AuthResult {
    bool ok = false;
    std::string code;
    std::string message;
    nlohmann::json extras = nlohmann::json::object();
    std::optional<AuthenticatedUser> authenticatedUser;
};

class AuthService {
private:
    UserRepository& users;
    ModerationRepository& moderation;

public:
    AuthService(UserRepository& users, ModerationRepository& moderation);

    AuthResult registerUser(
        const std::string& email,
        const std::string& username,
        const std::string& nickname,
        const std::string& password
    );

    AuthResult loginUser(
        const std::string& identifier,
        const std::string& password
    );
};

#endif
