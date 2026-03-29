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
    static void placePlayerAtSpawn(Player& player, const MapLoader& mapLoader, const WorldDefinition& worldDefinition);
};

#endif
