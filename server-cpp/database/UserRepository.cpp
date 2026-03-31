#include "UserRepository.h"

namespace {
    long long parseLongLong(const std::optional<std::string>& value) {
        if (!value.has_value() || value->empty()) {
            return 0;
        }

        return std::stoll(*value);
    }

    int parseInt(const std::optional<std::string>& value) {
        if (!value.has_value() || value->empty()) {
            return 0;
        }

        return std::stoi(*value);
    }
}

UserRepository::UserRepository(Database& database)
    : database(database) {}

std::optional<UserRecord> UserRepository::findById(long long id, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, email, username, nickname, password_hash, created_at "
        "FROM users WHERE id = $1 LIMIT 1",
        {std::to_string(id)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapUser(result);
}

std::optional<UserRecord> UserRepository::mapUser(const DatabaseQueryResult& result) const {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    UserRecord user;
    user.id = parseLongLong(row.get("id"));
    user.email = row.get("email").value_or("");
    user.username = row.get("username").value_or("");
    user.nickname = row.get("nickname").value_or("");
    user.passwordHash = row.get("password_hash").value_or("");
    user.createdAt = row.get("created_at").value_or("");
    return user;
}

std::optional<PlayerProfileRecord> UserRepository::mapProfile(const DatabaseQueryResult& result) const {
    if (!result.ok || result.rows.empty()) {
        return std::nullopt;
    }

    const DatabaseRow& row = result.rows.front();
    PlayerProfileRecord profile;
    profile.userId = parseLongLong(row.get("user_id"));
    profile.level = parseInt(row.get("level"));
    profile.xp = parseInt(row.get("xp"));
    profile.coins = parseInt(row.get("coins"));
    return profile;
}

std::optional<UserRecord> UserRepository::findByEmail(const std::string& email, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, email, username, nickname, password_hash, created_at "
        "FROM users WHERE email = $1 LIMIT 1",
        {email}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapUser(result);
}

std::optional<UserRecord> UserRepository::findByUsername(const std::string& username, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, email, username, nickname, password_hash, created_at "
        "FROM users WHERE username = $1 LIMIT 1",
        {username}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapUser(result);
}

std::optional<UserRecord> UserRepository::findByNickname(const std::string& nickname, std::string* error) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, email, username, nickname, password_hash, created_at "
        "FROM users WHERE nickname = $1 LIMIT 1",
        {nickname}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapUser(result);
}

std::optional<UserRecord> UserRepository::findByEmailOrUsername(
    const std::string& value,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT id, email, username, nickname, password_hash, created_at "
        "FROM users WHERE email = $1 OR username = $1 LIMIT 1",
        {value}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapUser(result);
}

std::optional<PlayerProfileRecord> UserRepository::findProfileByUserId(
    long long userId,
    std::string* error
) const {
    DatabaseQueryResult result = database.execute(
        "SELECT user_id, level, xp, coins "
        "FROM player_profiles WHERE user_id = $1 LIMIT 1",
        {std::to_string(userId)}
    );

    if (!result.ok && error != nullptr) {
        *error = result.error;
    }

    return mapProfile(result);
}

bool UserRepository::createUser(const CreateUserRequest& request, UserRecord* outUser, std::string* error) {
    DatabaseQueryResult result = database.execute(
        "INSERT INTO users (email, username, nickname, password_hash) "
        "VALUES ($1, $2, $3, $4) "
        "RETURNING id, email, username, nickname, password_hash, created_at",
        {request.email, request.username, request.nickname, request.passwordHash}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<UserRecord> created = mapUser(result);
    if (!created.has_value()) {
        if (error != nullptr) {
            *error = "User insert returned no rows";
        }
        return false;
    }

    if (outUser != nullptr) {
        *outUser = *created;
    }

    return true;
}

bool UserRepository::updatePasswordHash(long long userId, const std::string& passwordHash, std::string* error) {
    DatabaseQueryResult result = database.execute(
        "UPDATE users SET password_hash = $2 WHERE id = $1",
        {std::to_string(userId), passwordHash}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    if (result.affectedRows <= 0) {
        if (error != nullptr) {
            *error = "Password hash update affected no rows";
        }
        return false;
    }

    return true;
}

bool UserRepository::createInitialProfile(
    long long userId,
    PlayerProfileRecord* outProfile,
    std::string* error
) {
    DatabaseQueryResult result = database.execute(
        "INSERT INTO player_profiles (user_id) "
        "VALUES ($1) "
        "RETURNING user_id, level, xp, coins",
        {std::to_string(userId)}
    );

    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    std::optional<PlayerProfileRecord> created = mapProfile(result);
    if (!created.has_value()) {
        if (error != nullptr) {
            *error = "Profile insert returned no rows";
        }
        return false;
    }

    if (outProfile != nullptr) {
        *outProfile = *created;
    }

    return true;
}

bool UserRepository::createUserWithInitialProfile(
    const CreateUserRequest& request,
    UserWithProfile* outRecord,
    std::string* error
) {
    std::string transactionError;
    if (!database.beginTransaction(&transactionError)) {
        if (error != nullptr) {
            *error = transactionError;
        }
        return false;
    }

    UserRecord user;
    if (!createUser(request, &user, &transactionError)) {
        database.rollbackTransaction();
        if (error != nullptr) {
            *error = transactionError;
        }
        return false;
    }

    PlayerProfileRecord profile;
    if (!createInitialProfile(user.id, &profile, &transactionError)) {
        database.rollbackTransaction();
        if (error != nullptr) {
            *error = transactionError;
        }
        return false;
    }

    if (!database.commitTransaction(&transactionError)) {
        database.rollbackTransaction();
        if (error != nullptr) {
            *error = transactionError;
        }
        return false;
    }

    if (outRecord != nullptr) {
        outRecord->user = user;
        outRecord->profile = profile;
    }

    return true;
}

long long UserRepository::countUsers(std::string* error) const {
    DatabaseQueryResult result = database.execute("SELECT COUNT(*) AS total_users FROM users");
    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return -1;
    }

    if (result.rows.empty()) {
        return 0;
    }

    return parseLongLong(result.rows.front().get("total_users"));
}
