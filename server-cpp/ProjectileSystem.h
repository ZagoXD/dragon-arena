#ifndef PROJECTILE_SYSTEM_H
#define PROJECTILE_SYSTEM_H

#include <map>
#include <vector>
#include <string>
#include "Player.h"
#include "MapLoader.h"
#include "GameConfig.h"
#include "GameState.h"
class NetworkHandler;

class ProjectileSystem {
public:
    static void releasePendingAutoAttacks(
        std::map<std::string, Player>& players,
        std::vector<PendingAutoAttack>& pendingAutoAttacks,
        std::vector<ActiveProjectile>& activeProjectiles,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );

    static void updateProjectiles(
        std::map<std::string, Player>& players,
        std::map<std::string, DummyEntity>& dummies,
        std::vector<ActiveProjectile>& activeProjectiles,
        std::vector<ActiveBurnStatus>& activeBurnStatuses,
        std::vector<BurnZone>& burnZones,
        const MapLoader& mapLoader,
        const WorldDefinition& worldDefinition,
        unsigned long long worldTick,
        float deltaSeconds,
        long long nowMs,
        NetworkHandler* network
    );

    static void updateAreaEffects(
        std::map<std::string, Player>& players,
        std::map<std::string, DummyEntity>& dummies,
        std::vector<ActiveAreaEffect>& activeAreaEffects,
        std::vector<ActiveBurnStatus>& activeBurnStatuses,
        const WorldDefinition& worldDefinition,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );
};

#endif
