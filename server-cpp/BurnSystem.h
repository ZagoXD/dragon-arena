#ifndef BURN_SYSTEM_H
#define BURN_SYSTEM_H

#include <map>
#include <string>
#include <vector>
#include "GameConfig.h"
#include "GameState.h"
#include "Player.h"
class NetworkHandler;

class BurnSystem {
public:
    static void tryApplyToPlayer(
        Player& target,
        Player& attacker,
        const std::string& sourceSpellId,
        std::vector<ActiveBurnStatus>& activeBurnStatuses,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );

    static void tryApplyToDummy(
        DummyEntity& target,
        Player& attacker,
        const std::string& sourceSpellId,
        std::vector<ActiveBurnStatus>& activeBurnStatuses,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );

    static void spawnTrailZones(
        ActiveProjectile& projectile,
        const PassiveDefinition& passive,
        std::vector<BurnZone>& burnZones,
        long long nowMs
    );

    static void updateBurnStatuses(
        std::map<std::string, Player>& players,
        std::map<std::string, DummyEntity>& dummies,
        std::vector<ActiveBurnStatus>& activeBurnStatuses,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );

    static void refreshPlayerMovementModifiers(
        std::map<std::string, Player>& players,
        const std::vector<ActiveBurnStatus>& activeBurnStatuses,
        long long nowMs
    );

    static void updateBurnZones(
        std::map<std::string, Player>& players,
        std::map<std::string, DummyEntity>& dummies,
        std::vector<BurnZone>& burnZones,
        unsigned long long worldTick,
        long long nowMs,
        NetworkHandler* network
    );
};

#endif
