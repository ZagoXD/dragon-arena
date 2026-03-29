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
    std::string characterId;
    float x, y;
    std::string direction;
    int animRow;
    int hp, maxHp;
    int kills, deaths;
    float movementSpeed;
    float colliderWidth;
    float colliderHeight;
    float inputX = 0.0f;
    float inputY = 0.0f;
    std::string autoAttackSpellId;
    std::vector<std::string> skillIds;
    long long deathTimeMs = 0;

    // Dash / Skill 1 State
    bool isDashing = false;
    float dashStartX = 0, dashStartY = 0;
    float dashTargetX = 0, dashTargetY = 0;
    long long dashStartTime = 0;
    long long dashDuration = 0;
    std::map<std::string, long long> lastSkillUseTimes;
    std::vector<std::string> dashHitIds;

    Player() = default;
    Player(std::string id, std::string name, const CharacterDefinition& definition);

    json to_json() const;
    void update_position(float x, float y, std::string dir, int anim);
    bool take_damage(int amount);
    void respawn(float startX, float startY);
    bool canRespawn(long long nowMs, int respawnDelayMs) const;
};

#endif
