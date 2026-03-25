#ifndef GAME_WORLD_H
#define GAME_WORLD_H

#include <map>
#include <mutex>
#include <string>
#include <vector>
#include "Player.h"
#include "GameConfig.h"
#include "MovementSystem.h"
#include "CombatSystem.h"
class NetworkHandler;

class GameWorld {
private:
    std::map<std::string, Player> players;
    struct Dummy {
        std::string id;
        float x, y;
        int hp;
        long long deathTime; // timestamp in ms, 0 if alive
    };
    std::map<std::string, Dummy> dummies;
    std::mutex mtx;
    std::map<std::string, CharacterStats> charConfigs;

public:
    GameWorld();
    void addPlayer(std::string id, std::string name, std::string charId, int maxHp);
    void removePlayer(std::string id);
    bool movePlayer(std::string id, float x, float y, std::string dir, int anim);
    json getPlayersJson();
    json getPlayerJson(std::string id);
    json getDummiesJson();

    struct HitResult {
        bool hit;
        bool killed;
        int newHp;
        int attackerKills;
        int victimDeaths;
    };

    HitResult hitPlayer(std::string victimId, std::string attackerId, int damage);
    int hitDummy(std::string dummyId, int damage);
    int takeDamage(std::string id, int amount);
    void respawnPlayer(std::string id);
    void update(NetworkHandler* network); // Check for dummy respawns
};

#endif
