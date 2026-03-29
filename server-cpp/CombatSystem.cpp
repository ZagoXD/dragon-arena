#include "CombatSystem.h"
#include <algorithm>

PlayerDamageResult CombatSystem::applyAttackToPlayer(Player& victim, Player* attacker, int damage, bool awardScore) {
    bool killed = victim.take_damage(damage);
    if (killed) {
        victim.deaths++;
        if (awardScore && attacker != nullptr && attacker->id != victim.id) {
            attacker->kills++;
        }
    }

    return {
        true,
        killed,
        victim.hp,
        attacker != nullptr ? attacker->kills : 0,
        victim.deaths
    };
}

int CombatSystem::applyDirectDamageToPlayer(Player& victim, int damage) {
    victim.take_damage(damage);
    return victim.hp;
}

DummyDamageResult CombatSystem::applyDamageToDummy(DummyEntity& dummy, int damage, long long nowMs) {
    if (dummy.hp <= 0) {
        return {false, false, 0};
    }

    dummy.hp = std::max(0, dummy.hp - damage);
    bool killed = dummy.hp == 0;
    if (killed) {
        dummy.deathTime = nowMs;
    }

    return {
        true,
        killed,
        dummy.hp
    };
}
