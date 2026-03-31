#include "GameWorld.h"
#include "BurnSystem.h"
#include "DashSystem.h"
#include "NetworkHandler.h"
#include "ProtocolPayloadBuilder.h"
#include "ProjectileSystem.h"
#include "RespawnSystem.h"
#include "ServerDiagnostics.h"
#include "SkillSystem.h"
#include "ProtocolConfig.h"
#include "WorldSetup.h"
#include "WorldSnapshotBuilder.h"
#include "WorldTickRunner.h"
#include <chrono>

GameWorld::GameWorld() : worldDefinition(GameConfig::getWorldDefinition()) {
    mapLoader.loadMap("map-assets/tiled/default_map.tmj");
    worldDefinition = WorldSetup::resolveWorldDefinition(mapLoader);
    dummies = WorldSetup::createInitialDummies(mapLoader, worldDefinition);
}

void GameWorld::addPlayer(std::string id, std::string name, std::string charId) {
    std::lock_guard<std::mutex> lock(mtx);
    const auto& definition = GameConfig::getCharacterDefinition(charId);
    Player p(id, name, definition);
    WorldSetup::placePlayerAtSpawn(p, mapLoader, worldDefinition);
    players[id] = p;
}

void GameWorld::removePlayer(std::string id) {
    std::lock_guard<std::mutex> lock(mtx);
    players.erase(id);
}

bool GameWorld::movePlayer(std::string id, float inputX, float inputY, std::string dir, int anim) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) {
        if (players[id].isDashing) return false;
        MovementSystem::handleMoveIntent(players[id], inputX, inputY, dir, anim);
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
    return WorldSnapshotBuilder::buildDummiesJson(dummies);
}

json GameWorld::getProjectilesJson() {
    std::lock_guard<std::mutex> lock(mtx);
    return WorldSnapshotBuilder::buildProjectilesJson(activeProjectiles);
}

json GameWorld::getWorldSnapshotJson() {
    std::lock_guard<std::mutex> lock(mtx);
    return WorldSnapshotBuilder::buildWorldSnapshot(worldTick, players, dummies, activeProjectiles, activeBurnStatuses, burnZones);
}

json GameWorld::getBootstrapJson(std::string playerId) {
    std::lock_guard<std::mutex> lock(mtx);
    json payload = ProtocolPayloadBuilder::buildBootstrap(worldDefinition, players, playerId);
    payload["event"] = "bootstrap";
    return payload;
}

json GameWorld::getSessionInitJson(std::string playerId) {
    std::lock_guard<std::mutex> lock(mtx);
    auto now = std::chrono::steady_clock::now();
    long long serverTimeMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

    return ProtocolPayloadBuilder::buildSessionInit(
        worldTick,
        serverTimeMs,
        worldDefinition,
        players,
        dummies,
        activeProjectiles,
        activeBurnStatuses,
        burnZones,
        mapLoader.isLoaded() ? mapLoader.getRawMapData() : json(),
        playerId
    );
}
GameWorld::HitResult GameWorld::hitPlayer(std::string victimId, std::string attackerId) {
    std::lock_guard<std::mutex> lock(mtx);
    HitResult res = {false, false, 0, 0, 0};

    if (!players.count(victimId) || !players.count(attackerId)) {
        return res;
    }

    Player& victim = players[victimId];
    Player& attacker = players[attackerId];
    const auto& autoAttack = GameConfig::getSpellDefinition(attacker.autoAttackSpellId);
    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(victim, &attacker, autoAttack.damage, true);

    res.hit = damageResult.applied;
    res.killed = damageResult.killed;
    res.newHp = damageResult.newHp;
    res.attackerKills = damageResult.attackerKills;
    res.victimDeaths = damageResult.victimDeaths;
    return res;
}

int GameWorld::hitDummy(std::string attackerId, std::string dummyId) {
    std::lock_guard<std::mutex> lock(mtx);
    if (!dummies.count(dummyId) || !players.count(attackerId)) {
        return -1;
    }

    DummyEntity& dummy = dummies[dummyId];
    if (dummy.hp <= 0) {
        return 0;
    }

    const auto& autoAttack = GameConfig::getSpellDefinition(players[attackerId].autoAttackSpellId);
    auto now = std::chrono::steady_clock::now();
    long long nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    return CombatSystem::applyDamageToDummy(dummy, autoAttack.damage, nowMs).newHp;
}

void GameWorld::update(NetworkHandler* network) {
    std::lock_guard<std::mutex> lock(mtx);
    auto now = std::chrono::steady_clock::now();
    long long now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    TickComputation tick = WorldTickRunner::beginTick(worldTick, lastUpdateMs, now_ms);
    worldTick = tick.tick;
    ServerDiagnostics::logTickEvent("worldUpdate", {
        {"tick", worldTick},
        {"deltaSeconds", tick.deltaSeconds},
        {"players", players.size()},
        {"projectiles", activeProjectiles.size()}
    });

    updateSimulation(network, tick.deltaSeconds, now_ms);
    broadcastSnapshot(network, now_ms);
}

bool GameWorld::requestAutoAttack(std::string playerId, float targetX, float targetY, NetworkHandler* network) {
    std::lock_guard<std::mutex> lock(mtx);
    return SkillSystem::requestAutoAttack(players, pendingAutoAttacks, worldTick, playerId, targetX, targetY, network);
}

bool GameWorld::useSkill(std::string playerId, std::string skillId, float targetX, float targetY, NetworkHandler* network) {
    std::lock_guard<std::mutex> lock(mtx);
    return SkillSystem::useSkill(players, activeProjectiles, activeAreaEffects, worldTick, playerId, skillId, targetX, targetY, network);
}

void GameWorld::updateSimulation(NetworkHandler* network, float deltaSeconds, long long now_ms) {
    updateDashes(network, now_ms);
    WorldTickRunner::updatePlayerMovement(players, mapLoader, worldTick, deltaSeconds, network);
    updatePendingAutoAttacks(network, now_ms);
    updateProjectiles(network, deltaSeconds, now_ms);
    updateAreaEffects(network, now_ms);
    updateBurns(network, now_ms);
    updateDummyRespawns(network, now_ms);
}

void GameWorld::broadcastSnapshot(NetworkHandler* network, long long now_ms) {
    if (network == nullptr) {
        return;
    }

    if (!WorldTickRunner::shouldBroadcastSnapshot(now_ms, lastSnapshotMs, DRAGON_ARENA_SNAPSHOT_INTERVAL_MS)) {
        return;
    }

    ServerDiagnostics::logTickEvent("worldSnapshotBroadcast", {
        {"tick", worldTick},
        {"players", players.size()},
        {"dummies", dummies.size()},
        {"projectiles", activeProjectiles.size()}
    });
    network->broadcast(WorldSnapshotBuilder::buildWorldSnapshot(worldTick, players, dummies, activeProjectiles, activeBurnStatuses, burnZones).dump());
}

void GameWorld::updateDashes(NetworkHandler* network, long long now_ms) {
    DashSystem::updateDashes(players, dummies, activeBurnStatuses, worldDefinition, worldTick, now_ms, network);
}

void GameWorld::updateDummyRespawns(NetworkHandler* network, long long now_ms) {
    RespawnSystem::updateDummyRespawns(dummies, worldDefinition, worldTick, now_ms, network);
}

void GameWorld::updatePendingAutoAttacks(NetworkHandler* network, long long now_ms) {
    ProjectileSystem::releasePendingAutoAttacks(
        players,
        pendingAutoAttacks,
        activeProjectiles,
        worldTick,
        now_ms,
        network
    );
}

void GameWorld::updateProjectiles(NetworkHandler* network, float deltaSeconds, long long now_ms) {
    ProjectileSystem::updateProjectiles(
        players,
        dummies,
        activeProjectiles,
        activeBurnStatuses,
        burnZones,
        mapLoader,
        worldDefinition,
        worldTick,
        deltaSeconds,
        now_ms,
        network
    );
}

void GameWorld::updateAreaEffects(NetworkHandler* network, long long now_ms) {
    ProjectileSystem::updateAreaEffects(
        players,
        dummies,
        activeAreaEffects,
        activeBurnStatuses,
        worldDefinition,
        worldTick,
        now_ms,
        network
    );
}

void GameWorld::updateBurns(NetworkHandler* network, long long now_ms) {
    BurnSystem::updateBurnStatuses(players, dummies, activeBurnStatuses, worldTick, now_ms, network);
    BurnSystem::updateBurnZones(players, dummies, burnZones, worldTick, now_ms, network);
}

int GameWorld::takeDamage(std::string id, int amount) {
    std::lock_guard<std::mutex> lock(mtx);
    if (players.count(id)) {
        return CombatSystem::applyDirectDamageToPlayer(players[id], amount);
    }
    return -1;
}

bool GameWorld::respawnPlayer(std::string id) {
    std::lock_guard<std::mutex> lock(mtx);
    return RespawnSystem::respawnPlayer(players, mapLoader, worldDefinition, id);
}
