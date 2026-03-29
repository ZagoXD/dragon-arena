#include "MovementSystem.h"
#include <algorithm>
#include <cmath>

void MovementSystem::handleMoveIntent(Player& p, float inputX, float inputY, std::string dir, int anim) {
    float magnitude = std::sqrt(inputX * inputX + inputY * inputY);
    if (magnitude > 1.0f) {
        inputX /= magnitude;
        inputY /= magnitude;
    }

    p.inputX = inputX;
    p.inputY = inputY;
    p.direction = dir;
    p.animRow = anim;
}

bool MovementSystem::applyMovement(Player& p, float deltaSeconds, const MapLoader& mapLoader) {
    if (deltaSeconds <= 0.0f) {
        return false;
    }

    float nx = p.x + p.inputX * p.movementSpeed * deltaSeconds;
    float ny = p.y + p.inputY * p.movementSpeed * deltaSeconds;
    bool moved = false;

    if (mapLoader.isLoaded()) {
        nx = std::max(0.0f, std::min(nx, mapLoader.getWidthPixels() - p.colliderWidth));
        ny = std::max(0.0f, std::min(ny, mapLoader.getHeightPixels() - p.colliderHeight));

        bool blockedBoth = mapLoader.isBlocked(nx, ny, p.colliderWidth, p.colliderHeight);
        bool blockedX = mapLoader.isBlocked(nx, p.y, p.colliderWidth, p.colliderHeight);
        bool blockedY = mapLoader.isBlocked(p.x, ny, p.colliderWidth, p.colliderHeight);

        if (!blockedBoth) {
            moved = (nx != p.x || ny != p.y);
            p.x = nx;
            p.y = ny;
        } else if (!blockedX) {
            moved = (nx != p.x);
            p.x = nx;
        } else if (!blockedY) {
            moved = (ny != p.y);
            p.y = ny;
        }
    } else {
        nx = std::max(0.0f, std::min(nx, 2048.0f - p.colliderWidth));
        ny = std::max(0.0f, std::min(ny, 1280.0f - p.colliderHeight));
        moved = (nx != p.x || ny != p.y);
        p.x = nx;
        p.y = ny;
    }

    return moved;
}
