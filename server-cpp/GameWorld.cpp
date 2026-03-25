#include "GameWorld.h"
#include "NetworkHandler.h"
#include <iostream>

GameWorld::GameWorld() {
    charConfigs = GameConfig::get_characters();
    // Iniciar Dummies com deathTime = 0
    dummies["d1"] = {"d1", 2048.0f / 2 - 200, 1280.0f / 2 - 200, 500, 0};
    dummies["d2"] = {"d2", 2048.0f / 2 + 200, 1280.0f / 2 - 100, 500, 0};
    dummies["d3"] = {"d3", 2048.0f / 2,       1280.0f / 2 + 250, 500, 0};
}

void GameWorld::addPlayer(std::string id, std::string name, std::string charId, int maxHp) {
    std::lock_guard<std::mutex> lock(mtx);
    players[id] = Player(id, name, charId, maxHp);
}

void GameWorld::removePlayer(std::string id) {
    std::lock_guard<std::mutex> lock(mtx);
    players.erase(id);
}

bool GameWorld::movePlayer(std::string id, float x, float y, std::string dir, int anim) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) {
        MovementSystem::handleMove(players[id], x, y, dir, anim);
        return true;
    }
    return false;
}

json GameWorld::getPlayersJson() {
    std::lock_guard<std::mutex> lock(mtx);
    json j = json::object();
    for (auto const& [id, p] : players) {
        j[id] = p.to_json();
    }
    return j;
}

json GameWorld::getPlayerJson(std::string id) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) return players[id].to_json();
    return json::object();
}

json GameWorld::getDummiesJson() {
    std::lock_guard<std::mutex> lock(mtx);
    json j = json::array();
    for (auto const& [id, d] : dummies) {
        j.push_back({{"id", d.id}, {"x", d.x}, {"y", d.y}, {"hp", d.hp}});
    }
    return j;
}

GameWorld::HitResult GameWorld::hitPlayer(std::string victimId, std::string attackerId, int damage) {
    std::lock_guard<std::mutex> lock(mtx);
    HitResult res = {false, false, 0, 0, 0};
    
    // Permitir hit mesmo se o attackerId não estiver no mapa (ex: dummy ou sistema)
    // Mas no Dragon Arena original, o attackerId costuma ser o socket.id
    if (players.count(victimId)) {
        res.hit = true;
        Player* attacker = players.count(attackerId) ? &players[attackerId] : nullptr;
        
        bool killed = players[victimId].take_damage(damage);
        if (killed) {
            players[victimId].deaths++;
            if (attacker && attacker->id != victimId) {
                attacker->kills++;
            }
        }

        res.killed = killed;
        res.newHp = players[victimId].hp;
        res.attackerKills = attacker ? attacker->kills : 0;
        res.victimDeaths = players[victimId].deaths;
    }
    return res;
}

int GameWorld::hitDummy(std::string dummyId, int damage) {
    std::lock_guard<std::mutex> lock(mtx);
    if (dummies.count(dummyId)) {
        if (dummies[dummyId].hp <= 0) return 0;

        dummies[dummyId].hp = std::max(0, dummies[dummyId].hp - damage);
        if (dummies[dummyId].hp == 0) {
            auto now = std::chrono::steady_clock::now();
            dummies[dummyId].deathTime = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
        }
        return dummies[dummyId].hp;
    }
    return -1;
}

void GameWorld::update(NetworkHandler* network) {
    std::lock_guard<std::mutex> lock(mtx);
    // std::cout << "[GAME] World update tick..." << std::endl;
    auto now = std::chrono::steady_clock::now();
    long long now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

    for (auto& [id, d] : dummies) {
        if (d.hp <= 0 && d.deathTime > 0) {
            if (now_ms - d.deathTime >= 10000) { // 10s respawn
                d.hp = 500;
                d.deathTime = 0;
                
                if (network) {
                    json respawnEvent = {
                        {"event", "dummyDamaged"},
                        {"id", d.id},
                        {"hp", d.hp}
                    };
                    network->broadcast(respawnEvent.dump());
                }
            }
        }
    }
}

int GameWorld::takeDamage(std::string id, int amount) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) {
        players[id].take_damage(amount);
        return players[id].hp;
    }
    return -1;
}

void GameWorld::respawnPlayer(std::string id) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) {
        CombatSystem::handleRespawn(players[id]);
    }
}
