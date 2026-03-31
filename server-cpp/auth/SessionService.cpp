#include "SessionService.h"
#include <chrono>
#include <vector>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>
#include <bcrypt.h>
#pragma comment(lib, "bcrypt.lib")
#endif

namespace {
    std::string bytesToHex(const std::vector<unsigned char>& bytes) {
        static const char* hex = "0123456789abcdef";
        std::string output;
        output.reserve(bytes.size() * 2);

        for (unsigned char byte : bytes) {
            output.push_back(hex[(byte >> 4) & 0x0F]);
            output.push_back(hex[byte & 0x0F]);
        }

        return output;
    }
}

SessionService::SessionService(UserRepository& users, long long sessionTtlMs)
    : users(users), sessionTtlMs(sessionTtlMs) {}

long long SessionService::nowMs() const {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
}

std::string SessionService::generateToken(std::string* error) const {
#ifdef _WIN32
    std::vector<unsigned char> bytes(32, 0);
    NTSTATUS status = BCryptGenRandom(
        nullptr,
        bytes.data(),
        static_cast<ULONG>(bytes.size()),
        BCRYPT_USE_SYSTEM_PREFERRED_RNG
    );

    if (status < 0) {
        if (error != nullptr) {
            *error = "BCryptGenRandom failed while generating session token";
        }
        return {};
    }

    return bytesToHex(bytes);
#else
    if (error != nullptr) {
        *error = "Session tokens are only implemented on Windows in this build";
    }
    return {};
#endif
}

void SessionService::pruneExpiredLocked(long long currentTimeMs) {
    for (auto it = sessions.begin(); it != sessions.end();) {
        if (it->second.expiresAtMs <= currentTimeMs) {
            it = sessions.erase(it);
        } else {
            ++it;
        }
    }
}

SessionAuthResult SessionService::buildAuthenticatedSession(const SessionRecord& record) {
    std::string repositoryError;
    std::optional<UserRecord> user = users.findById(record.userId, &repositoryError);
    if (!user.has_value()) {
        if (!repositoryError.empty()) {
            return {false, "database_error", repositoryError, std::nullopt};
        }
        return {false, "invalid_session", "Session user no longer exists", std::nullopt};
    }

    repositoryError.clear();
    std::optional<PlayerProfileRecord> profile = users.findProfileByUserId(record.userId, &repositoryError);
    if (!profile.has_value()) {
        if (!repositoryError.empty()) {
            return {false, "database_error", repositoryError, std::nullopt};
        }

        PlayerProfileRecord createdProfile;
        if (!users.createInitialProfile(record.userId, &createdProfile, &repositoryError)) {
            return {false, "database_error", repositoryError, std::nullopt};
        }

        profile = createdProfile;
    }

    return {
        true,
        "session_authenticated",
        "Session authenticated",
        AuthenticatedSession{AuthenticatedUser{*user, *profile}, record}
    };
}

SessionAuthResult SessionService::createSession(const AuthenticatedUser& authenticatedUser) {
    std::string tokenError;
    std::string token = generateToken(&tokenError);
    if (token.empty()) {
        return {false, "session_error", tokenError, std::nullopt};
    }

    SessionRecord record;
    record.token = token;
    record.userId = authenticatedUser.user.id;
    record.expiresAtMs = nowMs() + sessionTtlMs;

    {
        std::lock_guard<std::mutex> lock(sessionsMutex);
        pruneExpiredLocked(nowMs());
        sessions[record.token] = record;
    }

    return {
        true,
        "session_created",
        "Session created",
        AuthenticatedSession{authenticatedUser, record}
    };
}

SessionAuthResult SessionService::authenticateToken(const std::string& token) {
    if (token.empty()) {
        return {false, "invalid_session", "Session token is required", std::nullopt};
    }

    SessionRecord record;
    {
        std::lock_guard<std::mutex> lock(sessionsMutex);
        long long currentTimeMs = nowMs();
        pruneExpiredLocked(currentTimeMs);

        auto it = sessions.find(token);
        if (it == sessions.end()) {
            return {false, "invalid_session", "Session token is invalid or expired", std::nullopt};
        }

        it->second.expiresAtMs = currentTimeMs + sessionTtlMs;
        record = it->second;
    }

    return buildAuthenticatedSession(record);
}
