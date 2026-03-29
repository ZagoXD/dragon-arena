#ifndef DASH_SYSTEM_H
#define DASH_SYSTEM_H

#include <map>
#include <string>
#include "GameConfig.h"
#include "GameState.h"
#include "Player.h"
class NetworkHandler;

class DashSystem {
public:
    static void updateDashes(
        std::map<std::string, Player>& players,
        std::map<std::string, DummyEntity>& dummies,
        const WorldDefinition& worldDefinition,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );
};

#endif
