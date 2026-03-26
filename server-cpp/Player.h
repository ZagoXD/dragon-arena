#ifndef PLAYER_H
#define PLAYER_H

#include <string>
#include <nlohmann/json.hpp>

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

    // Dash / Skill 1 State
    bool isDashing = false;
    float dashStartX = 0, dashStartY = 0;
    float dashTargetX = 0, dashTargetY = 0;
    long long dashStartTime = 0;
    long long dashDuration = 0;
    long long lastSkill1Time = 0;
    std::vector<std::string> dashHitIds;

    Player() = default;
    Player(std::string id, std::string name, std::string charId, int maxHp);

    json to_json() const;
    void update_position(float x, float y, std::string dir, int anim);
    bool take_damage(int amount);
    void respawn(float startX, float startY);
};

#endif
