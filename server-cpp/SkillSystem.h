#ifndef SKILL_SYSTEM_H
#define SKILL_SYSTEM_H

#include <map>
#include <vector>
#include <string>
#include "Player.h"
#include "GameState.h"
class NetworkHandler;

class SkillSystem {
public:
    static bool requestAutoAttack(
        std::map<std::string, Player>& players,
        std::vector<PendingAutoAttack>& pendingAutoAttacks,
        unsigned long long worldTick,
        const std::string& playerId,
        float targetX,
        float targetY,
        NetworkHandler* network
    );

    static bool useSkill(
        std::map<std::string, Player>& players,
        std::vector<ActiveProjectile>& activeProjectiles,
        std::vector<ActiveAreaEffect>& activeAreaEffects,
        unsigned long long worldTick,
        const std::string& playerId,
        const std::string& skillId,
        float targetX,
        float targetY,
        NetworkHandler* network
    );
};

#endif
