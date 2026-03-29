#include "WorldSetup.h"
#include <cstdlib>

WorldDefinition WorldSetup::resolveWorldDefinition(const MapLoader& mapLoader) {
    WorldDefinition worldDefinition = GameConfig::getWorldDefinition();

    if (mapLoader.isLoaded()) {
        worldDefinition.tileSize = mapLoader.getWorldTileSize();
        worldDefinition.mapWidth = mapLoader.getWidthPixels();
        worldDefinition.mapHeight = mapLoader.getHeightPixels();
    }

    return worldDefinition;
}

std::map<std::string, DummyEntity> WorldSetup::createInitialDummies(const MapLoader& mapLoader, const WorldDefinition& worldDefinition) {
    std::map<std::string, DummyEntity> dummies;
    const auto& dummySpawns = mapLoader.getDummySpawns();

    if (!dummySpawns.empty()) {
        for (size_t i = 0; i < dummySpawns.size(); ++i) {
            std::string dummyId = dummySpawns[i].name;
            if (dummyId.empty() || dummyId == "unknown") {
                dummyId = "d" + std::to_string(i + 1);
            }

            dummies[dummyId] = {
                dummyId,
                dummySpawns[i].x,
                dummySpawns[i].y,
                worldDefinition.dummyMaxHp,
                0
            };
        }

        return dummies;
    }

    dummies["d1"] = {
        "d1",
        worldDefinition.mapWidth / 2.0f - 200.0f,
        worldDefinition.mapHeight / 2.0f - 200.0f,
        worldDefinition.dummyMaxHp,
        0
    };
    dummies["d2"] = {
        "d2",
        worldDefinition.mapWidth / 2.0f + 200.0f,
        worldDefinition.mapHeight / 2.0f - 100.0f,
        worldDefinition.dummyMaxHp,
        0
    };
    dummies["d3"] = {
        "d3",
        worldDefinition.mapWidth / 2.0f,
        worldDefinition.mapHeight / 2.0f + 250.0f,
        worldDefinition.dummyMaxHp,
        0
    };

    return dummies;
}

void WorldSetup::placePlayerAtSpawn(Player& player, const MapLoader& mapLoader, const WorldDefinition& worldDefinition) {
    const auto& playerSpawns = mapLoader.getPlayerSpawns();
    if (!playerSpawns.empty()) {
        int spawnIndex = rand() % playerSpawns.size();
        player.x = playerSpawns[spawnIndex].x;
        player.y = playerSpawns[spawnIndex].y;
        return;
    }

    player.x = mapLoader.isLoaded()
        ? mapLoader.getWidthPixels() / 2.0f - player.colliderWidth / 2.0f
        : static_cast<float>(worldDefinition.mapWidth) / 2.0f - player.colliderWidth / 2.0f;
    player.y = mapLoader.isLoaded()
        ? mapLoader.getHeightPixels() / 2.0f - player.colliderHeight / 2.0f
        : static_cast<float>(worldDefinition.mapHeight) / 2.0f - player.colliderHeight / 2.0f;
}
