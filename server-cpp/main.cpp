#include "database/Database.h"
#include "database/UserRepository.h"
#include "moderation/ModerationRepository.h"
#include "moderation/ReportRepository.h"
#include "social/FriendshipRepository.h"
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

        UserRepository users(database);
        ModerationRepository moderation(database);
        ReportRepository reports(database);
        FriendshipRepository friendships(database);
        PrivateChatRepository privateChats(database);
        ArenaChatRepository arenaChats(database);
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

        std::string friendshipSchemaError;
        if (friendships.ensureSchema(&friendshipSchemaError)) {
            std::cout << "[Database] friendships schema ready." << std::endl;
        } else {
            std::cerr << "[Database] Could not ensure friendships schema: " << friendshipSchemaError << std::endl;
        }

        std::string moderationSchemaError;
        if (moderation.ensureSchema(&moderationSchemaError)) {
            std::cout << "[Database] user_bans schema ready." << std::endl;
        } else {
            std::cerr << "[Database] Could not ensure user_bans schema: " << moderationSchemaError << std::endl;
        }

        std::string reportSchemaError;
        if (reports.ensureSchema(&reportSchemaError)) {
            std::cout << "[Database] player_reports schema ready." << std::endl;
        } else {
            std::cerr << "[Database] Could not ensure player_reports schema: " << reportSchemaError << std::endl;
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
