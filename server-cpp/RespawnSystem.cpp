#include "RespawnSystem.h"
#include "NetworkHandler.h"
#include "WorldSetup.h"
#include <chrono>

void RespawnSystem::updateDummyRespawns(
    std::map<std::string, DummyEntity>& dummies,
    const WorldDefinition& worldDefinition,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    for (auto& [dummyId, dummy] : dummies) {
        if (dummy.hp > 0 || dummy.deathTime <= 0) {
            continue;
        }

        if (nowMs - dummy.deathTime < worldDefinition.dummyRespawnMs) {
            continue;
        }

        dummy.hp = worldDefinition.dummyMaxHp;
        dummy.deathTime = 0;

        if (network) {
            network->broadcast(json({
                {"event", "dummyDamaged"},
                {"tick", worldTick},
                {"id", dummyId},
                {"hp", dummy.hp}
            }).dump());
        }
    }
}

bool RespawnSystem::respawnPlayer(
    std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const WorldDefinition& worldDefinition,
    const std::string& playerId
) {
    auto it = players.find(playerId);
    if (it == players.end()) {
        return false;
    }

    auto now = std::chrono::steady_clock::now();
    long long nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    Player& player = it->second;

    if (!player.canRespawn(nowMs, worldDefinition.playerRespawnMs)) {
        return false;
    }

    WorldSetup::placePlayerAtSpawn(player, mapLoader, worldDefinition);
    player.respawn(player.x, player.y);
    player.inputX = 0.0f;
    player.inputY = 0.0f;
    player.isDashing = false;
    player.dashHitIds.clear();

    return true;
}
