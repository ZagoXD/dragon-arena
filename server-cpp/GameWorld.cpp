#include "GameWorld.h"
#include "NetworkHandler.h"
#include <iostream>
#include <cmath>
#include <algorithm>

GameWorld::GameWorld() {
    charConfigs = GameConfig::get_characters();
    
    mapLoader.loadMap("map-assets/tiled/default_map.tmj");
    
    const auto& dSpawns = mapLoader.getDummySpawns();
    if (!dSpawns.empty()) {
        for (size_t i = 0; i < dSpawns.size(); ++i) {
            std::string dId = dSpawns[i].name;
            if (dId.empty() || dId == "unknown") dId = "d" + std::to_string(i + 1);
            dummies[dId] = {dId, dSpawns[i].x, dSpawns[i].y, 500, 0};
        }
    } else {
        dummies["d1"] = {"d1", 2048.0f / 2 - 200, 1280.0f / 2 - 200, 500, 0};
        dummies["d2"] = {"d2", 2048.0f / 2 + 200, 1280.0f / 2 - 100, 500, 0};
        dummies["d3"] = {"d3", 2048.0f / 2,       1280.0f / 2 + 250, 500, 0};
    }
}

void GameWorld::addPlayer(std::string id, std::string name, std::string charId, int maxHp) {
    std::lock_guard<std::mutex> lock(mtx);
    Player p(id, name, charId, maxHp);
    
    const auto& pSpawns = mapLoader.getPlayerSpawns();
    if (!pSpawns.empty()) {
        int r = rand() % pSpawns.size();
        p.x = pSpawns[r].x;
        p.y = pSpawns[r].y;
    } else {
        p.x = mapLoader.isLoaded() ? mapLoader.getWidthPixels() / 2.0f : 1024.0f;
        p.y = mapLoader.isLoaded() ? mapLoader.getHeightPixels() / 2.0f : 640.0f;
    }
    
    players[id] = p;
}

void GameWorld::removePlayer(std::string id) {
    std::lock_guard<std::mutex> lock(mtx);
    players.erase(id);
}

bool GameWorld::movePlayer(std::string id, float x, float y, std::string dir, int anim) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) {
        if (players[id].isDashing) return false;
        MovementSystem::handleMove(players[id], x, y, dir, anim, mapLoader);
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
    auto now = std::chrono::steady_clock::now();
    long long now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

    // 1. Update Dashes
    updateDashes(network, now_ms);

    // 2. Update Dummies
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

void GameWorld::useSkill(std::string playerId, std::string skillId, float targetX, float targetY, NetworkHandler* network) {
    std::lock_guard<std::mutex> lock(mtx);
    if (!players.count(playerId)) return;
    Player &p = players[playerId];

    if (p.isDashing) return;

    auto now = std::chrono::steady_clock::now();
    long long now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

    if (skillId == "dragon_dive") {
        if (now_ms - p.lastSkill1Time < 3000) return;

        float dx = targetX - p.x;
        float dy = targetY - p.y;
        float dist = std::sqrt(dx*dx + dy*dy);
        if (dist > 600.0f) {
            targetX = p.x + (dx / dist) * 600.0f;
            targetY = p.y + (dy / dist) * 600.0f;
        }

        p.isDashing = true;
        p.dashStartX = p.x;
        p.dashStartY = p.y;
        p.dashTargetX = targetX;
        p.dashTargetY = targetY;
        p.dashStartTime = now_ms;
        p.dashDuration = 300; 
        p.lastSkill1Time = now_ms;
        p.dashHitIds.clear();

        if (network) {
            network->broadcast(json({
                {"event", "skillUsed"}, {"id", playerId}, 
                {"skillId", skillId}, {"targetX", targetX}, {"targetY", targetY}
            }).dump());
        }
    }
}

void GameWorld::updateDashes(NetworkHandler* network, long long now_ms) {
    for (auto& [pid, p] : players) {
        if (!p.isDashing) continue;

        long long elapsed = now_ms - p.dashStartTime;
        float t = std::min(1.0f, (float)elapsed / (float)p.dashDuration);

        float nx = p.dashStartX + (p.dashTargetX - p.dashStartX) * t;
        float ny = p.dashStartY + (p.dashTargetY - p.dashStartY) * t;

        p.x = nx;
        p.y = ny;

        // Collision detection for damage
        // Hit players
        for (auto& [otherId, target] : players) {
            if (otherId == pid || target.hp <= 0) continue;
            
            bool alreadyHit = false;
            for (const auto& hitId : p.dashHitIds) if (hitId == otherId) { alreadyHit = true; break; }
            if (alreadyHit) continue;

            float dx = (target.x + 32) - (p.x + 32);
            float dy = (target.y + 32) - (p.y + 32);
            if (std::sqrt(dx*dx + dy*dy) < 64.0f) {
                target.take_damage(200);
                p.dashHitIds.push_back(otherId);
                if (network) {
                    network->broadcast(json({{"event", "playerDamaged"}, {"id", otherId}, {"hp", target.hp}}).dump());
                }
            }
        }

        // Hit dummies
        for (auto& [did, d] : dummies) {
            if (d.hp <= 0) continue;
            
            bool alreadyHit = false;
            for (const auto& hitId : p.dashHitIds) if (hitId == did) { alreadyHit = true; break; }
            if (alreadyHit) continue;

            float dx = d.x - (p.x + 32); 
            float dy = d.y - (p.y + 32);
            if (std::sqrt(dx*dx + dy*dy) < 64.0f) {
                d.hp = std::max(0, d.hp - 200);
                p.dashHitIds.push_back(did);
                if (d.hp == 0) d.deathTime = now_ms;
                if (network) {
                    network->broadcast(json({{"event", "dummyDamaged"}, {"id", did}, {"hp", d.hp}}).dump());
                }
            }
        }

        if (t >= 1.0f) {
            p.isDashing = false;
        }

        if (network) {
            network->broadcast(json({
                {"event", "playerMoved"}, {"id", pid}, 
                {"x", p.x}, {"y", p.y}, 
                {"direction", p.direction}, {"animRow", p.animRow},
                {"isDashing", p.isDashing}
            }).dump());
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
        
        const auto& pSpawns = mapLoader.getPlayerSpawns();
        if (!pSpawns.empty()) {
            int r = rand() % pSpawns.size();
            players[id].x = pSpawns[r].x;
            players[id].y = pSpawns[r].y;
        } else if (mapLoader.isLoaded()) {
            players[id].x = mapLoader.getWidthPixels() / 2.0f - 32.0f;
            players[id].y = mapLoader.getHeightPixels() / 2.0f - 32.0f;
        }
    }
}
