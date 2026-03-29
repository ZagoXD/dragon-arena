#include "WorldSnapshotBuilder.h"

json WorldSnapshotBuilder::buildPlayersJson(const std::map<std::string, Player>& players) {
    json result = json::object();
    for (const auto& [id, player] : players) {
        result[id] = player.to_json();
    }
    return result;
}

json WorldSnapshotBuilder::buildDummiesJson(const std::map<std::string, DummyEntity>& dummies) {
    json result = json::array();
    for (const auto& [id, dummy] : dummies) {
        result.push_back({
            {"id", dummy.id},
            {"x", dummy.x},
            {"y", dummy.y},
            {"hp", dummy.hp}
        });
    }
    return result;
}

json WorldSnapshotBuilder::buildProjectilesJson(const std::vector<ActiveProjectile>& projectiles) {
    json result = json::array();
    for (const auto& projectile : projectiles) {
        result.push_back({
            {"id", projectile.id},
            {"ownerId", projectile.ownerId},
            {"spellId", projectile.spellId},
            {"x", projectile.x},
            {"y", projectile.y},
            {"angle", projectile.angle},
            {"distance", projectile.distanceTravelled}
        });
    }
    return result;
}

json WorldSnapshotBuilder::buildWorldState(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles
) {
    return {
        {"tick", tick},
        {"players", buildPlayersJson(players)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildProjectilesJson(projectiles)}
    };
}

json WorldSnapshotBuilder::buildWorldSnapshot(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles
) {
    return {
        {"event", "worldSnapshot"},
        {"tick", tick},
        {"players", buildPlayersJson(players)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildProjectilesJson(projectiles)}
    };
}
