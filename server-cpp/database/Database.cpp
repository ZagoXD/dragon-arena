#include "Database.h"
#include <nlohmann/json.hpp>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <memory>

using json = nlohmann::json;

namespace {
    std::optional<std::string> readEnvironmentValue(const char* key) {
        const char* value = std::getenv(key);
        if (value == nullptr || value[0] == '\0') {
            return std::nullopt;
        }

        return std::string(value);
    }

    std::string firstNonEmptyOrDefault(
        const std::initializer_list<std::optional<std::string>>& values,
        const std::string& fallback
    ) {
        for (const auto& value : values) {
            if (value.has_value() && !value->empty()) {
                return *value;
            }
        }

        return fallback;
    }

    int parseAffectedRows(const char* value) {
        if (value == nullptr || value[0] == '\0') {
            return 0;
        }

        try {
            return std::stoi(value);
        } catch (...) {
            return 0;
        }
    }

    void assignIfPresent(const json& data, const char* key, std::string& target) {
        if (data.contains(key) && data[key].is_string()) {
            target = data[key].get<std::string>();
        }
    }

    void assignOptionalIfPresent(const json& data, const char* key, std::optional<std::string>& target) {
        if (data.contains(key) && data[key].is_string()) {
            const std::string value = data[key].get<std::string>();
            if (!value.empty()) {
                target = value;
            }
        }
    }
}

DatabaseConfig DatabaseConfig::fromFileSystem() {
    DatabaseConfig config;
    const std::vector<std::string> pathsToTry = {
        "config/database.json",
        "../config/database.json",
        "../../config/database.json",
        "../../../config/database.json",
        "../../../../config/database.json",
        "../../../../../config/database.json",
    };

    for (const std::string& path : pathsToTry) {
        std::ifstream file(path);
        if (!file.is_open()) {
            continue;
        }

        try {
            json data;
            file >> data;

            assignOptionalIfPresent(data, "connectionString", config.connectionString);
            assignOptionalIfPresent(data, "connection_string", config.connectionString);
            assignIfPresent(data, "host", config.host);
            assignIfPresent(data, "port", config.port);
            assignIfPresent(data, "database", config.database);
            assignIfPresent(data, "dbname", config.database);
            assignIfPresent(data, "user", config.user);
            assignIfPresent(data, "username", config.user);
            assignIfPresent(data, "password", config.password);

            std::cout << "[Database] Loaded config file: " << path << std::endl;
            return config;
        } catch (const std::exception& error) {
            std::cerr << "[Database] Failed to parse config file '" << path << "': " << error.what() << std::endl;
            return config;
        }
    }

    return config;
}

DatabaseConfig DatabaseConfig::fromEnvironment() {
    DatabaseConfig config;

    config.connectionString = firstNonEmptyOrDefault(
        {readEnvironmentValue("DRAGON_DB_URL"), readEnvironmentValue("DATABASE_URL")},
        ""
    );
    if (config.connectionString->empty()) {
        config.connectionString.reset();
    }

    config.host = firstNonEmptyOrDefault(
        {readEnvironmentValue("DRAGON_DB_HOST"), readEnvironmentValue("PGHOST")},
        config.host
    );
    config.port = firstNonEmptyOrDefault(
        {readEnvironmentValue("DRAGON_DB_PORT"), readEnvironmentValue("PGPORT")},
        config.port
    );
    config.database = firstNonEmptyOrDefault(
        {readEnvironmentValue("DRAGON_DB_NAME"), readEnvironmentValue("PGDATABASE")},
        config.database
    );
    config.user = firstNonEmptyOrDefault(
        {readEnvironmentValue("DRAGON_DB_USER"), readEnvironmentValue("PGUSER")},
        config.user
    );
    config.password = firstNonEmptyOrDefault(
        {readEnvironmentValue("DRAGON_DB_PASSWORD"), readEnvironmentValue("PGPASSWORD")},
        config.password
    );

    return config;
}

DatabaseConfig DatabaseConfig::load() {
    DatabaseConfig config = fromFileSystem();
    DatabaseConfig environment = fromEnvironment();

    if (environment.connectionString.has_value() && !environment.connectionString->empty()) {
        config.connectionString = environment.connectionString;
    }

    if (const auto host = readEnvironmentValue("DRAGON_DB_HOST").value_or(readEnvironmentValue("PGHOST").value_or("")); !host.empty()) {
        config.host = host;
    }
    if (const auto port = readEnvironmentValue("DRAGON_DB_PORT").value_or(readEnvironmentValue("PGPORT").value_or("")); !port.empty()) {
        config.port = port;
    }
    if (const auto database = readEnvironmentValue("DRAGON_DB_NAME").value_or(readEnvironmentValue("PGDATABASE").value_or("")); !database.empty()) {
        config.database = database;
    }
    if (const auto user = readEnvironmentValue("DRAGON_DB_USER").value_or(readEnvironmentValue("PGUSER").value_or("")); !user.empty()) {
        config.user = user;
    }
    if (const auto password = readEnvironmentValue("DRAGON_DB_PASSWORD").value_or(readEnvironmentValue("PGPASSWORD").value_or("")); !password.empty()) {
        config.password = password;
    }

    return config;
}

std::string DatabaseConfig::toConnectionString() const {
    if (connectionString.has_value() && !connectionString->empty()) {
        return *connectionString;
    }

    std::string conn = "host=" + host +
        " port=" + port +
        " dbname=" + database +
        " user=" + user;

    if (!password.empty()) {
        conn += " password=" + password;
    }

    return conn;
}

std::string DatabaseConfig::describe() const {
    if (connectionString.has_value() && !connectionString->empty()) {
        return "connection_string_configured";
    }

    return "host=" + host +
        " port=" + port +
        " dbname=" + database +
        " user=" + user;
}

Database::Database(DatabaseConfig config)
    : config(std::move(config)), connection(nullptr) {}

Database::~Database() {
    disconnect();
}

bool Database::connect(std::string* error) {
    disconnect();

    connection = PQconnectdb(config.toConnectionString().c_str());
    if (connection == nullptr) {
        if (error != nullptr) {
            *error = "PQconnectdb returned null";
        }
        return false;
    }

    if (PQstatus(connection) != CONNECTION_OK) {
        if (error != nullptr) {
            *error = PQerrorMessage(connection);
        }
        disconnect();
        return false;
    }

    return true;
}

void Database::disconnect() {
    if (connection != nullptr) {
        PQfinish(connection);
        connection = nullptr;
    }
}

bool Database::isConnected() const {
    return connection != nullptr && PQstatus(connection) == CONNECTION_OK;
}

bool Database::ensureConnected(std::string* error) {
    if (isConnected()) {
        return true;
    }

    return connect(error);
}

DatabaseQueryResult Database::execute(
    const std::string& sql,
    const std::vector<std::optional<std::string>>& params
) {
    DatabaseQueryResult result;

    std::string connectError;
    if (!ensureConnected(&connectError)) {
        result.error = connectError;
        return result;
    }

    std::vector<std::string> paramStorage;
    std::vector<const char*> paramValues;
    paramStorage.reserve(params.size());
    paramValues.reserve(params.size());

    for (const auto& param : params) {
        if (param.has_value()) {
            paramStorage.push_back(*param);
            paramValues.push_back(paramStorage.back().c_str());
        } else {
            paramValues.push_back(nullptr);
        }
    }

    using ResultPtr = std::unique_ptr<PGresult, decltype(&PQclear)>;
    ResultPtr pgResult(
        PQexecParams(
            connection,
            sql.c_str(),
            static_cast<int>(paramValues.size()),
            nullptr,
            paramValues.empty() ? nullptr : paramValues.data(),
            nullptr,
            nullptr,
            0
        ),
        &PQclear
    );

    if (!pgResult) {
        result.error = "PQexecParams returned null";
        return result;
    }

    ExecStatusType status = PQresultStatus(pgResult.get());
    if (
        status != PGRES_TUPLES_OK &&
        status != PGRES_COMMAND_OK &&
        status != PGRES_SINGLE_TUPLE
    ) {
        result.error = PQresultErrorMessage(pgResult.get());
        return result;
    }

    result.ok = true;
    result.affectedRows = parseAffectedRows(PQcmdTuples(pgResult.get()));

    int rowCount = PQntuples(pgResult.get());
    int fieldCount = PQnfields(pgResult.get());
    for (int rowIndex = 0; rowIndex < rowCount; ++rowIndex) {
        DatabaseRow row;
        for (int fieldIndex = 0; fieldIndex < fieldCount; ++fieldIndex) {
            const char* fieldName = PQfname(pgResult.get(), fieldIndex);
            const char* value = PQgetisnull(pgResult.get(), rowIndex, fieldIndex)
                ? nullptr
                : PQgetvalue(pgResult.get(), rowIndex, fieldIndex);
            row.values[fieldName != nullptr ? fieldName : ""] = value != nullptr ? value : "";
        }
        result.rows.push_back(std::move(row));
    }

    return result;
}

bool Database::executeCommand(const std::string& sql, std::string* error) {
    DatabaseQueryResult result = execute(sql);
    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    return true;
}

bool Database::beginTransaction(std::string* error) {
    return executeCommand("BEGIN", error);
}

bool Database::commitTransaction(std::string* error) {
    return executeCommand("COMMIT", error);
}

bool Database::rollbackTransaction(std::string* error) {
    return executeCommand("ROLLBACK", error);
}

bool Database::ping(std::string* error) {
    DatabaseQueryResult result = execute("SELECT 1 AS ok");
    if (!result.ok) {
        if (error != nullptr) {
            *error = result.error;
        }
        return false;
    }

    if (
        result.rows.empty() ||
        !result.rows[0].get("ok").has_value() ||
        result.rows[0].get("ok").value() != "1"
    ) {
        if (error != nullptr) {
            *error = "Unexpected ping response";
        }
        return false;
    }

    return true;
}

std::optional<std::string> DatabaseRow::get(const std::string& key) const {
    auto it = values.find(key);
    if (it == values.end()) {
        return std::nullopt;
    }

    return it->second;
}
