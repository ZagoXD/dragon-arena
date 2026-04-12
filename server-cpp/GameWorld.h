#ifndef GAME_WORLD_H
#define GAME_WORLD_H

#include <map>
#include <optional>
#include <mutex>
#include <string>
#include <vector>
#include "MapCatalog.h"
#include "Player.h"
#include "GameConfig.h"
#include "GameState.h"
#include "MovementSystem.h"
#include "CombatSystem.h"
#include "MapLoader.h"
class NetworkHandler;

class GameWorld {
private:
    MapLoader mapLoader;
    std::map<std::string, Player> players;
    std::map<std::string, DummyEntity> dummies;
    std::vector<ActiveProjectile> activeProjectiles;
    std::vector<ActiveAreaEffect> activeAreaEffects;
    std::vector<ActiveBurnStatus> activeBurnStatuses;
    std::vector<BurnZone> burnZones;
    std::vector<PendingAutoAttack> pendingAutoAttacks;
    std::mutex mtx;
    WorldDefinition worldDefinition;
    unsigned long long worldTick = 0;
    long long lastUpdateMs = 0;
    long long lastSnapshotMs = 0;
    std::string instanceKey;
    std::string instanceMode;
    MapCatalogEntry mapEntry;
    std::map<std::string, std::string> assignedPlayerSpawnNames;
    std::size_t nextReservedSpawnIndex = 0;

public:
    GameWorld(std::string instanceKey = "", std::string instanceMode = "training");
    const MapLoader& getMapLoader() const { return mapLoader; }
    unsigned long long getCurrentTick() const { return worldTick; }
    const std::string& getInstanceKey() const { return instanceKey; }
    const std::string& getInstanceMode() const { return instanceMode; }
    const std::string& getMapId() const { return mapEntry.id; }
    bool isTrainingInstance() const { return instanceMode == "training"; }
    bool isMatchInstance() const { return instanceMode == "match"; }
    void addPlayer(std::string id, std::string name, std::string charId, std::string role = "player");
    void removePlayer(std::string id);
    bool movePlayer(std::string id, float inputX, float inputY, std::string dir, int anim);
    json getPlayersJson();
    json getPlayerJson(std::string id);
    json getDummiesJson();
    json getProjectilesJson();
    json getWorldSnapshotJson();
    json getBootstrapJson(std::string playerId);
    json getSessionInitJson(std::string playerId);
    std::optional<Player> getPlayerCopy(const std::string& id);
    std::vector<Player> getPlayersCopy();
    std::size_t getPlayerCount();

    struct HitResult {
        bool hit;
        bool killed;
        int newHp;
        int attackerKills;
        int victimDeaths;
    };

    HitResult hitPlayer(std::string victimId, std::string attackerId);
    int hitDummy(std::string attackerId, std::string dummyId);
    int takeDamage(std::string id, int amount);
    bool respawnPlayer(std::string id);
    bool changePlayerCharacter(const std::string& id, const std::string& charId);
    bool requestAutoAttack(std::string playerId, float targetX, float targetY, NetworkHandler* network);
    bool useSkill(std::string playerId, std::string skillId, float targetX, float targetY, NetworkHandler* network);
    void update(NetworkHandler* network); // High-frequency update
private:
    void assignPlayerSpawnNameIfNeeded(const std::string& playerId);
    void placePlayerUsingAssignedSpawn(Player& player);
    void updateSimulation(NetworkHandler* network, float deltaSeconds, long long now_ms);
    void broadcastSnapshot(NetworkHandler* network, long long now_ms);
    void updateDashes(NetworkHandler* network, long long now_ms);
    void updatePlayerRespawns(NetworkHandler* network, long long now_ms);
    void updateDummyRespawns(NetworkHandler* network, long long now_ms);
    void updateShields(long long now_ms);
    void updatePendingAutoAttacks(NetworkHandler* network, long long now_ms);
    void updateProjectiles(NetworkHandler* network, float deltaSeconds, long long now_ms);
    void updateAreaEffects(NetworkHandler* network, long long now_ms);
    void updateBurns(NetworkHandler* network, long long now_ms);
};

#endif
