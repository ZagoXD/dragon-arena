#ifndef RESPAWN_SYSTEM_H
#define RESPAWN_SYSTEM_H

#include <map>
#include <string>
#include "GameConfig.h"
#include "GameState.h"
#include "MapLoader.h"
#include "Player.h"
class NetworkHandler;

class RespawnSystem {
public:
    static void updatePlayerRespawns(
        std::map<std::string, Player>& players,
        const MapLoader& mapLoader,
        const WorldDefinition& worldDefinition,
        const std::map<std::string, std::string>& assignedPlayerSpawnNames,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );

    static void updateDummyRespawns(
        std::map<std::string, DummyEntity>& dummies,
        const WorldDefinition& worldDefinition,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );

    static bool respawnPlayer(
        std::map<std::string, Player>& players,
        const MapLoader& mapLoader,
        const WorldDefinition& worldDefinition,
        const std::map<std::string, std::string>& assignedPlayerSpawnNames,
        const std::string& playerId
    );
};

#endif
