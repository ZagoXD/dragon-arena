#include "database/Database.h"
#include "database/UserRepository.h"
#include "social/PrivateChatRepository.h"
#include "social/ArenaChatRepository.h"
#include "GameWorld.h"
#include "GameConfig.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <iostream>

int main() {
    GameConfig::validateDefinitions();
    Database database(DatabaseConfig::load());
    std::string databaseError;
    if (database.connect(&databaseError)) {
        std::cout << "[Database] Connected successfully (" << database.getConfig().describe() << ")" << std::endl;

        std::string pingError;
        if (database.ping(&pingError)) {
            std::cout << "[Database] SELECT 1 succeeded." << std::endl;
        } else {
            std::cerr << "[Database] Ping failed: " << pingError << std::endl;
        }

        if (database.getConfig().autoApplySchema) {
            std::string schemaPath;
            std::string schemaError;
            if (database.executeScriptFromFile(
                {
                    "config/database_schema.sql",
                    "../config/database_schema.sql",
                    "../../config/database_schema.sql",
                    "../../../config/database_schema.sql",
                    "../../../../config/database_schema.sql",
                },
                &schemaPath,
                &schemaError
            )) {
                std::cout << "[Database] Schema executed from: " << schemaPath << std::endl;
            } else {
                std::cerr << "[Database] Could not execute schema script: " << schemaError << std::endl;
            }
        } else {
            std::cout << "[Database] Auto schema apply disabled by config." << std::endl;
        }

        UserRepository users(database);
        PrivateChatRepository privateChats(database);
        ArenaChatRepository arenaChats(database);

        std::string countError;
        long long totalUsers = users.countUsers(&countError);
        if (totalUsers >= 0) {
            std::cout << "[Database] users table reachable. Current users: " << totalUsers << std::endl;
        } else {
            std::cerr << "[Database] Could not count users: " << countError << std::endl;
        }

        std::string privateChatCleanupError;
        if (privateChats.cleanupExpired(30, &privateChatCleanupError)) {
            std::cout << "[Database] private_messages cleanup completed." << std::endl;
        } else {
            std::cerr << "[Database] Could not cleanup private_messages: " << privateChatCleanupError << std::endl;
        }

        std::string arenaChatCleanupError;
        if (arenaChats.cleanupExpired(60, &arenaChatCleanupError)) {
            std::cout << "[Database] arena_messages cleanup completed." << std::endl;
        } else {
            std::cerr << "[Database] Could not cleanup arena_messages: " << arenaChatCleanupError << std::endl;
        }
    } else {
        std::cerr << "[Database] Connection failed (" << database.getConfig().describe() << "): " << databaseError << std::endl;
    }

    GameWorld world;
    std::cout << "[Startup]\n" << ServerDiagnostics::buildStartupSummaryText(world) << std::endl;
    NetworkHandler network(world, 3001, database);
    
    network.start();

    return 0;
}
