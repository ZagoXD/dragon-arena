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

json WorldSnapshotBuilder::buildBurnStatusesJson(const std::vector<ActiveBurnStatus>& statuses) {
    json result = json::array();
    for (const auto& status : statuses) {
        result.push_back({
            {"id", status.id},
            {"targetType", status.targetType},
            {"targetId", status.targetId},
            {"ownerId", status.ownerId},
            {"passiveId", status.passiveId},
            {"startTimeMs", status.startTimeMs},
            {"endTimeMs", status.endTimeMs}
        });
    }
    return result;
}

json WorldSnapshotBuilder::buildBurnZonesJson(const std::vector<BurnZone>& zones) {
    json result = json::array();
    for (const auto& zone : zones) {
        result.push_back({
            {"id", zone.id},
            {"ownerId", zone.ownerId},
            {"passiveId", zone.passiveId},
            {"x", zone.x},
            {"y", zone.y},
            {"size", zone.size},
            {"startTimeMs", zone.startTimeMs},
            {"endTimeMs", zone.endTimeMs}
        });
    }
    return result;
}

json WorldSnapshotBuilder::buildWorldState(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles,
    const std::vector<ActiveBurnStatus>& burnStatuses,
    const std::vector<BurnZone>& burnZones
) {
    return {
        {"tick", tick},
        {"players", buildPlayersJson(players)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildProjectilesJson(projectiles)},
        {"burnStatuses", buildBurnStatusesJson(burnStatuses)},
        {"burnZones", buildBurnZonesJson(burnZones)}
    };
}

json WorldSnapshotBuilder::buildWorldSnapshot(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles,
    const std::vector<ActiveBurnStatus>& burnStatuses,
    const std::vector<BurnZone>& burnZones
) {
    return {
        {"event", "worldSnapshot"},
        {"tick", tick},
        {"players", buildPlayersJson(players)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildProjectilesJson(projectiles)},
        {"burnStatuses", buildBurnStatusesJson(burnStatuses)},
        {"burnZones", buildBurnZonesJson(burnZones)}
    };
}
