#ifndef WORLD_TICK_RUNNER_H
#define WORLD_TICK_RUNNER_H

#include <map>
#include <vector>
#include "GameState.h"
#include "MapLoader.h"
#include "Player.h"
class NetworkHandler;

struct TickComputation {
    unsigned long long tick;
    float deltaSeconds;
};

class WorldTickRunner {
public:
    static TickComputation beginTick(unsigned long long currentTick, long long& lastUpdateMs, long long nowMs);

    static void updatePlayerMovement(
        std::map<std::string, Player>& players,
        const MapLoader& mapLoader,
        unsigned long long worldTick,
        float deltaSeconds,
        NetworkHandler* network
    );

    static bool shouldBroadcastSnapshot(long long nowMs, long long& lastSnapshotMs, long long snapshotIntervalMs);
};

#endif
