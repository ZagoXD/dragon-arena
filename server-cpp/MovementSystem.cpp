#include "MovementSystem.h"
#include <algorithm>


void MovementSystem::handleMove(Player &p, float nx, float ny, std::string dir, int anim, const MapLoader& mapLoader) {
    if (mapLoader.isLoaded()) {
        nx = std::max(0.0f, std::min(nx, mapLoader.getWidthPixels() - 64.0f));
        ny = std::max(0.0f, std::min(ny, mapLoader.getHeightPixels() - 64.0f));
        
        if (mapLoader.isBlocked(nx, ny, 64.0f, 64.0f)) {
            // Collision detected, ignore the move or perhaps let client sync it back.
            // For now, we block it from succeeding.
            return;
        }
    } else {
        nx = std::max(0.0f, std::min(nx, 2048.0f - 64.0f));
        ny = std::max(0.0f, std::min(ny, 1280.0f - 64.0f));
    }
    
    p.update_position(nx, ny, dir, anim);
}
