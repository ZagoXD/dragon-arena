#ifndef SESSION_SERVICE_H
#define SESSION_SERVICE_H

#include "../database/UserRepository.h"
#include "AuthService.h"
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

struct SessionRecord {
    std::string token;
    long long userId = 0;
    long long expiresAtMs = 0;
};

struct AuthenticatedSession {
    AuthenticatedUser authenticatedUser;
    SessionRecord session;
};

struct SessionAuthResult {
    bool ok = false;
    std::string code;
    std::string message;
    std::optional<AuthenticatedSession> authenticatedSession;
};

class SessionService {
private:
    UserRepository& users;
    long long sessionTtlMs;
    std::unordered_map<std::string, SessionRecord> sessions;
    std::mutex sessionsMutex;

    long long nowMs() const;
    std::string generateToken(std::string* error = nullptr) const;
    void pruneExpiredLocked(long long nowMs);
    SessionAuthResult buildAuthenticatedSession(const SessionRecord& record);

public:
    explicit SessionService(UserRepository& users, long long sessionTtlMs = 1000LL * 60 * 60 * 24 * 30);

    SessionAuthResult createSession(const AuthenticatedUser& authenticatedUser);
    SessionAuthResult authenticateToken(const std::string& token);
};

#endif
