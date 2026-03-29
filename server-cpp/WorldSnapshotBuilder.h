#ifndef WORLD_SNAPSHOT_BUILDER_H
#define WORLD_SNAPSHOT_BUILDER_H

#include <map>
#include <vector>
#include <string>
#include <nlohmann/json.hpp>
#include "Player.h"
#include "GameState.h"

using json = nlohmann::json;

class WorldSnapshotBuilder {
public:
    static json buildPlayersJson(const std::map<std::string, Player>& players);
    static json buildDummiesJson(const std::map<std::string, DummyEntity>& dummies);
    static json buildProjectilesJson(const std::vector<ActiveProjectile>& projectiles);
    static json buildWorldState(
        unsigned long long tick,
        const std::map<std::string, Player>& players,
        const std::map<std::string, DummyEntity>& dummies,
        const std::vector<ActiveProjectile>& projectiles
    );
    static json buildWorldSnapshot(
        unsigned long long tick,
        const std::map<std::string, Player>& players,
        const std::map<std::string, DummyEntity>& dummies,
        const std::vector<ActiveProjectile>& projectiles
    );
};

#endif
