#ifndef GAME_CONFIG_H
#define GAME_CONFIG_H

#include <string>
#include <map>

struct CharacterStats {
    int maxHp;
    int damage;
    float moveSpeed;
    float attackSpeed;
};

class GameConfig {
public:
    static std::map<std::string, CharacterStats> get_characters() {
        return {
            {"ember", {150, 15, 4.0f, 1.0f}},
            {"solis", {120, 20, 4.5f, 0.8f}},
            {"luna",  {100, 25, 4.2f, 1.2f}}
        };
    }
};

#endif
