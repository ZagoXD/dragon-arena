#ifndef PLAYER_H
#define PLAYER_H

#include <map>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>
#include "GameConfig.h"

using json = nlohmann::json;

class Player {
public:
    std::string id;
    std::string name;
    std::string role = "player";
    std::string characterId;
    float x, y;
    std::string direction;
    int animRow;
    int hp, maxHp;
    int shieldHp = 0;
    int shieldMaxHp = 0;
    int kills, deaths;
    float baseMovementSpeed;
    float movementSpeed;
    float colliderWidth;
    float colliderHeight;
    float inputX = 0.0f;
    float inputY = 0.0f;
    std::string autoAttackSpellId;
    std::vector<std::string> skillIds;
    std::string passiveId;
    long long deathTimeMs = 0;
    long long immobilizedUntilMs = 0;
    long long shieldEndTimeMs = 0;

    // Dash / Skill 1 State
    bool isDashing = false;
    float dashStartX = 0, dashStartY = 0;
    float dashTargetX = 0, dashTargetY = 0;
    long long dashStartTime = 0;
    long long dashDuration = 0;
    std::map<std::string, long long> lastSkillUseTimes;
    std::vector<std::string> dashHitIds;

    Player() = default;
    Player(std::string id, std::string name, const CharacterDefinition& definition, std::string role = "player");

    json to_json() const;
    void update_position(float x, float y, std::string dir, int anim);
    bool take_damage(int amount, long long nowMs = -1);
    void grantShield(int amount, long long durationMs, long long nowMs);
    void clearExpiredShield(long long nowMs);
    void respawn(float startX, float startY);
    bool canRespawn(long long nowMs, int respawnDelayMs) const;
};

#endif
