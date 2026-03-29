#ifndef MOVEMENT_SYSTEM_H
#define MOVEMENT_SYSTEM_H

#include "Player.h"
#include "MapLoader.h"
#include <string>

class MovementSystem {
public:
    static void handleMoveIntent(Player &p, float inputX, float inputY, std::string dir, int anim);
    static bool applyMovement(Player &p, float deltaSeconds, const MapLoader& mapLoader);
};

#endif
