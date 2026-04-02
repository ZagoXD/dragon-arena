#include <cassert>
#include <cmath>
#include <iostream>
#include <map>
#include <vector>
#include "../CombatSystem.h"
#include "../DashSystem.h"
#include "../GameConfig.h"
#include "../MapLoader.h"
#include "../MovementSystem.h"
#include "../Player.h"
#include "../ProjectileSystem.h"
#include "../ProtocolConfig.h"
#include "../ProtocolPayloadBuilder.h"
#include "../RespawnSystem.h"
#include "../SkillSystem.h"
#include "../WorldSetup.h"
#include "../WorldSnapshotBuilder.h"

namespace {
bool approx(float left, float right, float epsilon = 0.05f) {
    return std::fabs(left - right) <= epsilon;
}

Player makeCharizard(const std::string& id) {
    return Player(id, id, GameConfig::getCharacterDefinition("charizard"));
}

void testGameConfigValidation() {
    GameConfig::validateDefinitions();

    const auto& charizard = GameConfig::getCharacterDefinition("charizard");
    assert(charizard.autoAttackSpellId == "ember");
    assert(charizard.skillIds.size() == 3);
    assert(charizard.passiveId == "burn");
    const auto& hydra = GameConfig::getCharacterDefinition("hydra");
    assert(hydra.autoAttackSpellId == "scratch");
    assert(hydra.skillIds.size() == 3);
    assert(hydra.passiveId == "poison");
    assert(!GameConfig::getLoadedConfigPath().empty());
    assert(GameConfig::getLoadedConfigPath().find("config") != std::string::npos);
    assert(!GameConfig::getContentHash().empty());

    json summary = GameConfig::buildContentSummary();
    assert(summary["characters"]["count"] == 2);
    assert(summary["spells"]["count"] == 6);
    assert(summary["passives"]["count"] == 2);
}

void testMovementIntentAndBounds() {
    Player player = makeCharizard("p1");
    player.x = 100.0f;
    player.y = 200.0f;

    MovementSystem::handleMoveIntent(player, 3.0f, 4.0f, "right", 1);
    assert(approx(player.inputX, 0.6f, 0.01f));
    assert(approx(player.inputY, 0.8f, 0.01f));

    MapLoader unloadedMap;
    bool moved = MovementSystem::applyMovement(player, 1.0f, unloadedMap);
    assert(moved);
    assert(approx(player.x, 232.0f, 0.5f));
    assert(approx(player.y, 376.0f, 0.5f));

    player.x = 0.0f;
    player.y = 0.0f;
    MovementSystem::handleMoveIntent(player, -1.0f, -1.0f, "left", 1);
    moved = MovementSystem::applyMovement(player, 0.5f, unloadedMap);
    assert(!moved);
    assert(player.x == 0.0f);
    assert(player.y == 0.0f);
}

void testMovementCollisionWithMap() {
    MapLoader mapLoader;
    assert(mapLoader.loadMap("map-assets/tiled/default_map.tmj"));

    Player player = makeCharizard("p2");
    player.x = 0.0f;
    player.y = 0.0f;
    MovementSystem::handleMoveIntent(player, -1.0f, 0.0f, "left", 1);

    bool moved = MovementSystem::applyMovement(player, 0.25f, mapLoader);
    assert(!moved);
    assert(player.x == 0.0f);
}

void testCombatPlayerDamage() {
    const auto& definition = GameConfig::getCharacterDefinition("charizard");
    Player attacker("a", "Attacker", definition);
    Player victim("v", "Victim", definition);

    PlayerDamageResult result = CombatSystem::applyAttackToPlayer(victim, &attacker, definition.maxHp, true);
    assert(result.applied);
    assert(result.killed);
    assert(result.newHp == 0);
    assert(result.attackerKills == 1);
    assert(result.victimDeaths == 1);
}

void testCombatDummyDamage() {
    DummyEntity dummy{"d1", 100.0f, 100.0f, 50, 0};
    DummyDamageResult result = CombatSystem::applyDamageToDummy(dummy, 60, 1234);
    assert(result.applied);
    assert(result.killed);
    assert(result.newHp == 0);
    assert(dummy.deathTime == 1234);
}

void testAutoAttackCastAndProjectileLifecycle() {
    std::map<std::string, Player> players;
    players["attacker"] = makeCharizard("attacker");
    players["victim"] = makeCharizard("victim");
    players["attacker"].x = 0.0f;
    players["attacker"].y = 0.0f;
    players["victim"].x = 120.0f;
    players["victim"].y = 0.0f;

    std::vector<PendingAutoAttack> pendingAutoAttacks;
    std::vector<ActiveProjectile> activeProjectiles;
    std::map<std::string, DummyEntity> dummies;
    std::vector<ActiveBurnStatus> activeBurnStatuses;
    const auto& ember = GameConfig::getSpellDefinition("ember");

    bool accepted = SkillSystem::requestAutoAttack(players, pendingAutoAttacks, 10, "attacker", 500.0f, 32.0f, nullptr);
    assert(accepted);
    assert(pendingAutoAttacks.size() == 1);
    assert(!SkillSystem::requestAutoAttack(players, pendingAutoAttacks, 10, "attacker", 500.0f, 32.0f, nullptr));

    pendingAutoAttacks[0].releaseTimeMs = 0;
    ProjectileSystem::releasePendingAutoAttacks(
        players,
        dummies,
        pendingAutoAttacks,
        activeProjectiles,
        activeBurnStatuses,
        GameConfig::getWorldDefinition(),
        11,
        1,
        nullptr
    );
    assert(pendingAutoAttacks.empty());
    assert(activeProjectiles.size() == 1);

    std::vector<BurnZone> burnZones;
    MapLoader unloadedMap;
    ProjectileSystem::updateProjectiles(
        players,
        dummies,
        activeProjectiles,
        activeBurnStatuses,
        burnZones,
        unloadedMap,
        GameConfig::getWorldDefinition(),
        12,
        0.2f,
        ember.castTimeMs + 1,
        nullptr
    );

    assert(activeProjectiles.empty());
    assert(players["victim"].hp < players["victim"].maxHp);
}

void testSkillCooldownAndDashState() {
    std::map<std::string, Player> players;
    std::vector<ActiveProjectile> activeProjectiles;
    std::vector<ActiveAreaEffect> activeAreaEffects;
    players["attacker"] = makeCharizard("attacker");
    players["attacker"].x = 100.0f;
    players["attacker"].y = 100.0f;

    bool used = SkillSystem::useSkill(players, activeProjectiles, activeAreaEffects, 20, "attacker", "dragon_dive", 1000.0f, 100.0f, nullptr);
    assert(used);
    assert(players["attacker"].isDashing);
    assert(players["attacker"].dashTargetX <= players["attacker"].x + GameConfig::getSpellDefinition("dragon_dive").range + 0.1f);
    assert(!SkillSystem::useSkill(players, activeProjectiles, activeAreaEffects, 20, "attacker", "dragon_dive", 1000.0f, 100.0f, nullptr));
}

void testDashDamageAndRespawn() {
    std::map<std::string, Player> players;
    players["attacker"] = makeCharizard("attacker");
    players["target"] = makeCharizard("target");
    players["attacker"].x = 0.0f;
    players["attacker"].y = 0.0f;
    players["target"].x = 150.0f;
    players["target"].y = 0.0f;
    players["attacker"].isDashing = true;
    players["attacker"].dashStartX = 0.0f;
    players["attacker"].dashStartY = 0.0f;
    players["attacker"].dashTargetX = 300.0f;
    players["attacker"].dashTargetY = 0.0f;
    players["attacker"].dashStartTime = 1000;
    players["attacker"].dashDuration = 300;

    std::map<std::string, DummyEntity> dummies = {
        {"dummy", {"dummy", 170.0f, 32.0f, 500, 0}}
    };

    std::vector<ActiveBurnStatus> activeBurnStatuses;
    DashSystem::updateDashes(
        players,
        dummies,
        activeBurnStatuses,
        GameConfig::getWorldDefinition(),
        30,
        1150,
        nullptr
    );
    assert(players["target"].hp < players["target"].maxHp);
    assert(dummies["dummy"].hp < GameConfig::getWorldDefinition().dummyMaxHp);

    MapLoader mapLoader;
    assert(mapLoader.loadMap("map-assets/tiled/default_map.tmj"));
    players["target"].hp = 0;
    players["target"].deathTimeMs = 0;
    bool respawned = RespawnSystem::respawnPlayer(players, mapLoader, GameConfig::getWorldDefinition(), "target");
    assert(respawned);
    assert(players["target"].hp == players["target"].maxHp);
  }

void testWorldSetupAndProtocolPayloads() {
    MapLoader mapLoader;
    WorldDefinition world = WorldSetup::resolveWorldDefinition(mapLoader);
    auto dummies = WorldSetup::createInitialDummies(mapLoader, world);
    assert(world.tileSize == 64);
    assert(dummies.size() == 3);

    std::map<std::string, Player> players;
    players["p"] = makeCharizard("p");
    WorldSetup::placePlayerAtSpawn(players["p"], mapLoader, world);
    assert(players["p"].x >= 0.0f);
    assert(players["p"].y >= 0.0f);

    std::vector<ActiveProjectile> projectiles = {
        {"proj_1", "p", "ember", 100.0f, 100.0f, 0.0f, 20.0f, 0.0f, {}, {}}
    };

    std::vector<ActiveBurnStatus> burnStatuses;
    std::vector<BurnZone> burnZones;

    json snapshot = WorldSnapshotBuilder::buildWorldSnapshot(42, players, dummies, projectiles, burnStatuses, burnZones);
    assert(snapshot["event"] == "worldSnapshot");
    assert(snapshot["tick"] == 42);
    assert(snapshot["projectiles"].size() == 1);

    json sessionInit = ProtocolPayloadBuilder::buildSessionInit(
        42,
        123456,
        world,
        players,
        dummies,
        projectiles,
        burnStatuses,
        burnZones,
        json({{"width", 32}, {"height", 20}}),
        "p"
    );

    assert(sessionInit["event"] == "sessionInit");
    assert(sessionInit["protocolVersion"] == DRAGON_ARENA_PROTOCOL_VERSION);
    assert(sessionInit["bootstrap"]["contentHash"] == GameConfig::getContentHash());
    assert(sessionInit["capabilities"]["authoritativeGameplay"] == true);
    assert(sessionInit["snapshot"]["players"].contains("p"));

    json rejected = ProtocolPayloadBuilder::buildActionRejected("shoot", "cooldown", "On cooldown", 42, {{"skillId", "ember"}});
    assert(rejected["event"] == "actionRejected");
    assert(rejected["requestEvent"] == "shoot");
    assert(rejected["skillId"] == "ember");
}
}

int main() {
    testGameConfigValidation();
    testMovementIntentAndBounds();
    testMovementCollisionWithMap();
    testCombatPlayerDamage();
    testCombatDummyDamage();
    testAutoAttackCastAndProjectileLifecycle();
    testSkillCooldownAndDashState();
    testDashDamageAndRespawn();
    testWorldSetupAndProtocolPayloads();

    std::cout << "GameplayTests passed." << std::endl;
    return 0;
}
