#include "WorldTickRunner.h"
#include "NetworkHandler.h"
#include "MovementSystem.h"
#include <algorithm>

TickComputation WorldTickRunner::beginTick(unsigned long long currentTick, long long& lastUpdateMs, long long nowMs) {
    if (lastUpdateMs <= 0) {
        lastUpdateMs = nowMs;
    }

    float deltaSeconds = std::max(0.0f, static_cast<float>(nowMs - lastUpdateMs) / 1000.0f);
    lastUpdateMs = nowMs;

    return {
        currentTick + 1,
        deltaSeconds
    };
}

void WorldTickRunner::updatePlayerMovement(
    std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    unsigned long long worldTick,
    float deltaSeconds,
    NetworkHandler* network
) {
    for (auto& [playerId, player] : players) {
        if (player.hp <= 0 || player.isDashing) {
            continue;
        }

        if (!MovementSystem::applyMovement(player, deltaSeconds, mapLoader) || network == nullptr) {
            continue;
        }

        network->broadcast(json({
            {"event", "playerMoved"},
            {"tick", worldTick},
            {"id", playerId},
            {"x", player.x},
            {"y", player.y},
            {"direction", player.direction},
            {"animRow", player.animRow},
            {"isDashing", player.isDashing}
        }).dump());
    }
}

bool WorldTickRunner::shouldBroadcastSnapshot(long long nowMs, long long& lastSnapshotMs, long long snapshotIntervalMs) {
    if (lastSnapshotMs <= 0) {
        lastSnapshotMs = nowMs;
        return false;
    }

    if (nowMs - lastSnapshotMs < snapshotIntervalMs) {
        return false;
    }

    lastSnapshotMs = nowMs;
    return true;
}
