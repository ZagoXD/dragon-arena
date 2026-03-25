#ifndef COMBAT_SYSTEM_H
#define COMBAT_SYSTEM_H

#include "Player.h"
#include <string>

struct CombatResult {
    bool killed;
    int damageDealt;
};

class CombatSystem {
public:
    static CombatResult handleHit(Player &victim, Player &attacker, int damage);
    static void handleRespawn(Player &p);
};

#endif
