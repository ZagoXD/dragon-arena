#ifndef MOVEMENT_SYSTEM_H
#define MOVEMENT_SYSTEM_H

#include "Player.h"
#include "MapLoader.h"
#include <string>

class MovementSystem {
public:
    static void handleMove(Player &p, float nx, float ny, std::string dir, int anim, const MapLoader& mapLoader);
};

#endif
