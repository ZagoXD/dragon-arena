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

    Player() = default;
    Player(std::string id, std::string name, std::string charId, int maxHp);

    json to_json() const;
    void update_position(float x, float y, std::string dir, int anim);
    bool take_damage(int amount);
    void respawn(float startX, float startY);
};

#endif
