#ifndef COMBAT_SYSTEM_H
#define COMBAT_SYSTEM_H

#include "GameState.h"
#include "Player.h"
#include <string>

struct PlayerDamageResult {
    bool applied;
    bool killed;
    int newHp;
    int attackerKills;
    int victimDeaths;
};

struct DummyDamageResult {
    bool applied;
    bool killed;
    int newHp;
};

class CombatSystem {
public:
    static PlayerDamageResult applyAttackToPlayer(Player& victim, Player* attacker, int damage, bool awardScore);
    static int applyDirectDamageToPlayer(Player& victim, int damage);
    static DummyDamageResult applyDamageToDummy(DummyEntity& dummy, int damage, long long nowMs);
};

#endif
