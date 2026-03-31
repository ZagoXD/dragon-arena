#include "AuthService.h"
#include "PasswordHasher.h"
#include <algorithm>
#include <cctype>

namespace {
    std::string trimCopy(const std::string& value) {
        size_t start = 0;
        while (start < value.size() && std::isspace(static_cast<unsigned char>(value[start]))) {
            start++;
        }

        size_t end = value.size();
        while (end > start && std::isspace(static_cast<unsigned char>(value[end - 1]))) {
            end--;
        }

        return value.substr(start, end - start);
    }

    bool isAsciiAlphaNumericOrUnderscore(char ch) {
        return std::isalnum(static_cast<unsigned char>(ch)) || ch == '_';
    }

    bool isValidHandle(const std::string& value) {
        if (value.size() < 3 || value.size() > 20) {
            return false;
        }

        return std::all_of(value.begin(), value.end(), isAsciiAlphaNumericOrUnderscore);
    }

    bool isValidEmail(const std::string& value) {
        const auto at = value.find('@');
        if (at == std::string::npos || at == 0 || at == value.size() - 1) {
            return false;
        }

        if (value.find('@', at + 1) != std::string::npos) {
            return false;
        }

        const auto dot = value.find('.', at);
        return dot != std::string::npos && dot < value.size() - 1;
    }

    bool hasWhitespace(const std::string& value) {
        return std::any_of(value.begin(), value.end(), [](char ch) {
            return std::isspace(static_cast<unsigned char>(ch)) != 0;
        });
    }

    bool hasUppercase(const std::string& value) {
        return std::any_of(value.begin(), value.end(), [](char ch) {
            return std::isupper(static_cast<unsigned char>(ch)) != 0;
        });
    }

    bool hasLowercase(const std::string& value) {
        return std::any_of(value.begin(), value.end(), [](char ch) {
            return std::islower(static_cast<unsigned char>(ch)) != 0;
        });
    }

    bool hasDigit(const std::string& value) {
        return std::any_of(value.begin(), value.end(), [](char ch) {
            return std::isdigit(static_cast<unsigned char>(ch)) != 0;
        });
    }
}

AuthService::AuthService(UserRepository& users)
    : users(users) {}

AuthResult AuthService::registerUser(
    const std::string& email,
    const std::string& username,
    const std::string& nickname,
    const std::string& password
) {
    const std::string normalizedEmail = trimCopy(email);
    const std::string normalizedUsername = trimCopy(username);
    const std::string normalizedNickname = trimCopy(nickname);

    if (normalizedEmail.empty() || !isValidEmail(normalizedEmail)) {
        return {false, "invalid_email", "A valid email is required", std::nullopt};
    }

    if (!isValidHandle(normalizedUsername)) {
        return {false, "invalid_username", "Username must have 3-20 characters using only letters, digits or _", std::nullopt};
    }

    if (!isValidHandle(normalizedNickname)) {
        return {false, "invalid_nickname", "Nickname must have 3-20 characters using only letters, digits or _", std::nullopt};
    }

    if (password.size() < 8 || password.size() > 72) {
        return {false, "invalid_password", "Password must have between 8 and 72 characters", std::nullopt};
    }

    if (hasWhitespace(password)) {
        return {false, "invalid_password", "Password cannot contain whitespace", std::nullopt};
    }

    if (!hasUppercase(password) || !hasLowercase(password) || !hasDigit(password)) {
        return {false, "invalid_password", "Password must include uppercase, lowercase and numeric characters", std::nullopt};
    }

    std::string repositoryError;
    if (users.findByEmail(normalizedEmail, &repositoryError).has_value()) {
        return {false, "email_taken", "Email is already registered", std::nullopt};
    }
    if (!repositoryError.empty()) {
        return {false, "database_error", repositoryError, std::nullopt};
    }

    repositoryError.clear();
    if (users.findByNickname(normalizedNickname, &repositoryError).has_value()) {
        return {false, "nickname_taken", "Nickname is already registered", std::nullopt};
    }
    if (!repositoryError.empty()) {
        return {false, "database_error", repositoryError, std::nullopt};
    }

    repositoryError.clear();
    if (users.findByUsername(normalizedUsername, &repositoryError).has_value()) {
        return {false, "username_taken", "Username is already registered", std::nullopt};
    }
    if (!repositoryError.empty()) {
        return {false, "database_error", repositoryError, std::nullopt};
    }

    std::string hashError;
    std::string hashedPassword = PasswordHasher::hashPassword(password, &hashError);
    if (hashedPassword.empty()) {
        return {false, "password_hash_failed", hashError.empty() ? "Could not hash password" : hashError, std::nullopt};
    }

    UserWithProfile record;
    if (!users.createUserWithInitialProfile(
        {normalizedEmail, normalizedUsername, normalizedNickname, hashedPassword},
        &record,
        &repositoryError
    )) {
        return {false, "database_error", repositoryError, std::nullopt};
    }

    return {true, "registered", "Account created successfully", AuthenticatedUser{record.user, record.profile}};
}

AuthResult AuthService::loginUser(
    const std::string& identifier,
    const std::string& password
) {
    const std::string normalizedIdentifier = trimCopy(identifier);
    if (normalizedIdentifier.empty()) {
        return {false, "invalid_identifier", "Email or username is required", std::nullopt};
    }

    if (password.empty()) {
        return {false, "invalid_password", "Password is required", std::nullopt};
    }

    std::string repositoryError;
    std::optional<UserRecord> user = users.findByEmailOrUsername(normalizedIdentifier, &repositoryError);
    if (!user.has_value()) {
        if (!repositoryError.empty()) {
            return {false, "database_error", repositoryError, std::nullopt};
        }
        return {false, "invalid_credentials", "Invalid email/username or password", std::nullopt};
    }

    std::string verifyError;
    PasswordVerificationResult verification = PasswordHasher::verifyPassword(password, user->passwordHash, &verifyError);
    if (!verification.ok) {
        if (!verifyError.empty()) {
            return {false, "password_verification_failed", verifyError, std::nullopt};
        }
        return {false, "invalid_credentials", "Invalid email/username or password", std::nullopt};
    }

    if (verification.needsRehash) {
        std::string hashError;
        std::string upgradedHash = PasswordHasher::hashPassword(password, &hashError);
        if (upgradedHash.empty()) {
            return {false, "password_hash_failed", hashError.empty() ? "Could not upgrade password hash" : hashError, std::nullopt};
        }

        repositoryError.clear();
        if (!users.updatePasswordHash(user->id, upgradedHash, &repositoryError)) {
            return {false, "database_error", repositoryError, std::nullopt};
        }

        user->passwordHash = upgradedHash;
    }

    repositoryError.clear();
    std::optional<PlayerProfileRecord> profile = users.findProfileByUserId(user->id, &repositoryError);
    if (!profile.has_value()) {
        if (!repositoryError.empty()) {
            return {false, "database_error", repositoryError, std::nullopt};
        }

        PlayerProfileRecord createdProfile;
        if (!users.createInitialProfile(user->id, &createdProfile, &repositoryError)) {
            return {false, "database_error", repositoryError, std::nullopt};
        }

        profile = createdProfile;
    }

    return {true, "logged_in", "Login succeeded", AuthenticatedUser{*user, *profile}};
}
