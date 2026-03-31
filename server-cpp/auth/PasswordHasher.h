#ifndef PASSWORD_HASHER_H
#define PASSWORD_HASHER_H

#include <string>

struct PasswordVerificationResult {
    bool ok = false;
    bool needsRehash = false;
};

class PasswordHasher {
public:
    static std::string hashPassword(const std::string& password, std::string* error = nullptr);
    static PasswordVerificationResult verifyPassword(
        const std::string& password,
        const std::string& storedHash,
        std::string* error = nullptr
    );
};

#endif
