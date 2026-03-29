#ifndef GAME_STATE_H
#define GAME_STATE_H

#include <string>

struct DummyEntity {
    std::string id;
    float x;
    float y;
    int hp;
    long long deathTime;
};

struct ActiveProjectile {
    std::string id;
    std::string ownerId;
    std::string spellId;
    float x;
    float y;
    float angle;
    float distanceTravelled;
};

struct PendingAutoAttack {
    std::string playerId;
    std::string spellId;
    std::string projectileId;
    float originX;
    float originY;
    float angle;
    long long releaseTimeMs;
};

#endif
