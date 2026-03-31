#include "database/Database.h"
#include "database/UserRepository.h"
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

        UserRepository users(database);
        std::string roleSchemaError;
        if (users.ensureRoleSchema(&roleSchemaError)) {
            std::cout << "[Database] users.role schema ready." << std::endl;
        } else {
            std::cerr << "[Database] Could not ensure users.role schema: " << roleSchemaError << std::endl;
        }

        std::string promoteAdminError;
        if (users.updateRoleByEmailOrUsername("skyziinxd@gmail.com", "admin", &promoteAdminError) ||
            users.updateRoleByEmailOrUsername("Skyziinxd", "admin", &promoteAdminError)) {
            std::cout << "[Database] Admin role ensured for skyziinxd@gmail.com / Skyziinxd." << std::endl;
        } else if (!promoteAdminError.empty()) {
            std::cerr << "[Database] Could not ensure admin role: " << promoteAdminError << std::endl;
        }

        std::string countError;
        long long totalUsers = users.countUsers(&countError);
        if (totalUsers >= 0) {
            std::cout << "[Database] users table reachable. Current users: " << totalUsers << std::endl;
        } else {
            std::cerr << "[Database] Could not count users: " << countError << std::endl;
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
