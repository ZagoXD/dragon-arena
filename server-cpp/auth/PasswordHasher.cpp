#include "PasswordHasher.h"

#include <array>
#include <cstdint>
#include <sstream>
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
    constexpr const char* PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
    constexpr int PASSWORD_HASH_ITERATIONS = 120000;
    constexpr size_t PASSWORD_SALT_BYTES = 16;
    constexpr size_t PASSWORD_HASH_BYTES = 32;

    std::string toHex(const std::vector<unsigned char>& bytes) {
        static const char* hex = "0123456789abcdef";
        std::string output;
        output.reserve(bytes.size() * 2);

        for (unsigned char byte : bytes) {
            output.push_back(hex[(byte >> 4) & 0x0F]);
            output.push_back(hex[byte & 0x0F]);
        }

        return output;
    }

    bool fromHex(const std::string& value, std::vector<unsigned char>* out) {
        if (value.size() % 2 != 0 || out == nullptr) {
            return false;
        }

        auto parseNibble = [](char ch) -> int {
            if (ch >= '0' && ch <= '9') {
                return ch - '0';
            }
            if (ch >= 'a' && ch <= 'f') {
                return 10 + (ch - 'a');
            }
            if (ch >= 'A' && ch <= 'F') {
                return 10 + (ch - 'A');
            }
            return -1;
        };

        out->clear();
        out->reserve(value.size() / 2);

        for (size_t index = 0; index < value.size(); index += 2) {
            int high = parseNibble(value[index]);
            int low = parseNibble(value[index + 1]);
            if (high < 0 || low < 0) {
                out->clear();
                return false;
            }

            out->push_back(static_cast<unsigned char>((high << 4) | low));
        }

        return true;
    }

    std::vector<std::string> split(const std::string& value, char delimiter) {
        std::vector<std::string> parts;
        std::stringstream stream(value);
        std::string current;
        while (std::getline(stream, current, delimiter)) {
            parts.push_back(current);
        }
        return parts;
    }

    bool constantTimeEquals(const std::vector<unsigned char>& left, const std::vector<unsigned char>& right) {
        if (left.size() != right.size()) {
            return false;
        }

        unsigned char diff = 0;
        for (size_t index = 0; index < left.size(); ++index) {
            diff |= static_cast<unsigned char>(left[index] ^ right[index]);
        }

        return diff == 0;
    }

#ifdef _WIN32
    bool generateRandomBytes(std::vector<unsigned char>* out, size_t count, std::string* error) {
        if (out == nullptr) {
            if (error != nullptr) {
                *error = "Output buffer is null";
            }
            return false;
        }

        out->assign(count, 0);
        NTSTATUS status = BCryptGenRandom(
            nullptr,
            out->data(),
            static_cast<ULONG>(out->size()),
            BCRYPT_USE_SYSTEM_PREFERRED_RNG
        );

        if (status < 0) {
            if (error != nullptr) {
                *error = "BCryptGenRandom failed";
            }
            out->clear();
            return false;
        }

        return true;
    }

    bool deriveKey(
        const std::string& password,
        const std::vector<unsigned char>& salt,
        int iterations,
        std::vector<unsigned char>* out,
        std::string* error
    ) {
        if (out == nullptr) {
            if (error != nullptr) {
                *error = "Output buffer is null";
            }
            return false;
        }

        BCRYPT_ALG_HANDLE algorithm = nullptr;
        NTSTATUS openStatus = BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, BCRYPT_ALG_HANDLE_HMAC_FLAG);
        if (openStatus < 0) {
            if (error != nullptr) {
                *error = "BCryptOpenAlgorithmProvider failed";
            }
            return false;
        }

        out->assign(PASSWORD_HASH_BYTES, 0);
        NTSTATUS deriveStatus = BCryptDeriveKeyPBKDF2(
            algorithm,
            reinterpret_cast<PUCHAR>(const_cast<char*>(password.data())),
            static_cast<ULONG>(password.size()),
            const_cast<PUCHAR>(salt.data()),
            static_cast<ULONG>(salt.size()),
            static_cast<ULONGLONG>(iterations),
            out->data(),
            static_cast<ULONG>(out->size()),
            0
        );

        BCryptCloseAlgorithmProvider(algorithm, 0);

        if (deriveStatus < 0) {
            if (error != nullptr) {
                *error = "BCryptDeriveKeyPBKDF2 failed";
            }
            out->clear();
            return false;
        }

        return true;
    }
#endif
}

std::string PasswordHasher::hashPassword(const std::string& password, std::string* error) {
#ifdef _WIN32
    std::vector<unsigned char> salt;
    if (!generateRandomBytes(&salt, PASSWORD_SALT_BYTES, error)) {
        return {};
    }

    std::vector<unsigned char> derived;
    if (!deriveKey(password, salt, PASSWORD_HASH_ITERATIONS, &derived, error)) {
        return {};
    }

    return std::string(PASSWORD_HASH_PREFIX) + "$" +
        std::to_string(PASSWORD_HASH_ITERATIONS) + "$" +
        toHex(salt) + "$" +
        toHex(derived);
#else
    if (error != nullptr) {
        *error = "Password hashing is only implemented on Windows in this build";
    }
    return {};
#endif
}

PasswordVerificationResult PasswordHasher::verifyPassword(
    const std::string& password,
    const std::string& storedHash,
    std::string* error
) {
    if (storedHash.rfind(std::string(PASSWORD_HASH_PREFIX) + "$", 0) != 0) {
        return {storedHash == password, true};
    }

    std::vector<std::string> parts = split(storedHash, '$');
    if (parts.size() != 4) {
        if (error != nullptr) {
            *error = "Invalid password hash format";
        }
        return {false, false};
    }

    int iterations = 0;
    try {
        iterations = std::stoi(parts[1]);
    } catch (...) {
        if (error != nullptr) {
            *error = "Invalid password hash iteration count";
        }
        return {false, false};
    }

    std::vector<unsigned char> salt;
    std::vector<unsigned char> expectedHash;
    if (!fromHex(parts[2], &salt) || !fromHex(parts[3], &expectedHash)) {
        if (error != nullptr) {
            *error = "Invalid password hash encoding";
        }
        return {false, false};
    }

    std::vector<unsigned char> derived;
    if (!deriveKey(password, salt, iterations, &derived, error)) {
        return {false, false};
    }

    const bool matches = constantTimeEquals(derived, expectedHash);
    const bool needsRehash =
        iterations != PASSWORD_HASH_ITERATIONS ||
        salt.size() != PASSWORD_SALT_BYTES ||
        expectedHash.size() != PASSWORD_HASH_BYTES;

    return {matches, needsRehash};
}
