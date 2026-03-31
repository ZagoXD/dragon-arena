#ifndef GAME_STATE_H
#define GAME_STATE_H

#include <map>
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
    float lastTrailPlacementDistance = 0.0f;
    std::map<std::string, long long> playerHitTimes;
    std::map<std::string, long long> dummyHitTimes;
};

struct ActiveBurnStatus {
    std::string id;
    std::string targetType;
    std::string targetId;
    std::string ownerId;
    std::string passiveId;
    long long startTimeMs;
    long long endTimeMs;
    long long nextTickTimeMs;
};

struct BurnZone {
    std::string id;
    std::string ownerId;
    std::string passiveId;
    float x;
    float y;
    float size;
    long long startTimeMs;
    long long endTimeMs;
    long long nextTickTimeMs;
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

struct ActiveAreaEffect {
    std::string id;
    std::string ownerId;
    std::string spellId;
    float originX;
    float originY;
    float angle;
    long long startTimeMs;
    long long endTimeMs;
    long long nextTickTimeMs;
    int ticksApplied;
};

#endif
