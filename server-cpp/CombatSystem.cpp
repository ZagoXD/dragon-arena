#include "CombatSystem.h"

CombatResult CombatSystem::handleHit(Player &victim, Player &attacker, int damage) {
    bool killed = victim.take_damage(damage);
    if (killed) {
        victim.deaths++;
        attacker.kills++;
    }
    return { killed, damage };
}

void CombatSystem::handleRespawn(Player &p) {
    p.respawn(2048.0f / 2, 1280.0f / 2);
}
