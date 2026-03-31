#ifndef DATABASE_H
#define DATABASE_H

#include <libpq-fe.h>
#include <map>
#include <optional>
#include <string>
#include <vector>

struct DatabaseConfig {
    std::optional<std::string> connectionString;
    std::string host = "127.0.0.1";
    std::string port = "5432";
    std::string database = "dragon_arena";
    std::string user = "dragon_app";
    std::string password;

    static DatabaseConfig fromFileSystem();
    static DatabaseConfig fromEnvironment();
    static DatabaseConfig load();
    std::string toConnectionString() const;
    std::string describe() const;
};

struct DatabaseRow {
    std::map<std::string, std::string> values;

    std::optional<std::string> get(const std::string& key) const;
};

struct DatabaseQueryResult {
    bool ok = false;
    std::string error;
    std::vector<DatabaseRow> rows;
    int affectedRows = 0;
};

class Database {
private:
    DatabaseConfig config;
    PGconn* connection;

    bool ensureConnected(std::string* error = nullptr);
    bool executeCommand(const std::string& sql, std::string* error = nullptr);

public:
    explicit Database(DatabaseConfig config);
    ~Database();

    Database(const Database&) = delete;
    Database& operator=(const Database&) = delete;

    bool connect(std::string* error = nullptr);
    void disconnect();
    bool isConnected() const;
    bool ping(std::string* error = nullptr);

    DatabaseQueryResult execute(
        const std::string& sql,
        const std::vector<std::optional<std::string>>& params = {}
    );

    bool beginTransaction(std::string* error = nullptr);
    bool commitTransaction(std::string* error = nullptr);
    bool rollbackTransaction(std::string* error = nullptr);

    const DatabaseConfig& getConfig() const { return config; }
};

#endif
