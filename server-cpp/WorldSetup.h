#ifndef WORLD_SETUP_H
#define WORLD_SETUP_H

#include <map>
#include "GameConfig.h"
#include "GameState.h"
#include "MapLoader.h"
#include "Player.h"

class WorldSetup {
public:
    static WorldDefinition resolveWorldDefinition(const MapLoader& mapLoader);
    static std::map<std::string, DummyEntity> createInitialDummies(const MapLoader& mapLoader, const WorldDefinition& worldDefinition);
    static const SpawnPoint* findPlayerSpawnByName(const MapLoader& mapLoader, const std::string& spawnName);
    static bool placePlayerAtNamedSpawn(Player& player, const MapLoader& mapLoader, const WorldDefinition& worldDefinition, const std::string& spawnName);
    static void placePlayerAtSpawn(Player& player, const MapLoader& mapLoader, const WorldDefinition& worldDefinition);
};

#endif
