#include "WorldSnapshotBuilder.h"
#include "GameConfig.h"
#include <algorithm>
#include <array>
#include <cmath>

namespace {
constexpr float HIDE_EFFECT_VISIBILITY_THRESHOLD = 0.6f;

struct EffectVisualSpec {
    enum class Kind {
        Unknown,
        Beam,
        LineBurst,
        TileBurst,
        SelfAura,
    };

    Kind kind = Kind::Unknown;
    float width = 64.0f;
    float height = 64.0f;
    float scale = 1.0f;
    int lineSteps = 0;
    int beamSlices = 0;
    int tileRadius = 0;
};

std::array<std::pair<float, float>, 9> buildRectSamples(float centerX, float centerY, float width, float height) {
    const float halfWidth = width / 2.0f;
    const float halfHeight = height / 2.0f;
    return {{
        {centerX, centerY},
        {centerX - halfWidth, centerY - halfHeight},
        {centerX, centerY - halfHeight},
        {centerX + halfWidth, centerY - halfHeight},
        {centerX - halfWidth, centerY},
        {centerX + halfWidth, centerY},
        {centerX - halfWidth, centerY + halfHeight},
        {centerX, centerY + halfHeight},
        {centerX + halfWidth, centerY + halfHeight},
    }};
}

int getPlayerHideRegionId(const MapLoader& mapLoader, const Player& player) {
    return mapLoader.getHideRegionIdForActor(player.x, player.y, player.colliderWidth, player.colliderHeight);
}

bool isPlayerRevealed(
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    const std::string& playerId,
    long long nowMs
) {
    const auto it = revealedUntilByPlayerId.find(playerId);
    return it != revealedUntilByPlayerId.end() && it->second > nowMs;
}

bool isPlayerVisibleToObserver(
    const std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::string& targetId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    if (observerId == targetId) {
        return true;
    }

    const auto observerIt = players.find(observerId);
    const auto targetIt = players.find(targetId);
    if (observerIt == players.end() || targetIt == players.end()) {
        return false;
    }

    const int observerRegionId = getPlayerHideRegionId(mapLoader, observerIt->second);
    const int targetRegionId = getPlayerHideRegionId(mapLoader, targetIt->second);
    if (targetRegionId <= 0) {
        return true;
    }

    if (observerRegionId > 0 && observerRegionId == targetRegionId) {
        return true;
    }

    return isPlayerRevealed(revealedUntilByPlayerId, targetId, nowMs);
}

int getOwnerHideRegionId(
    const std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const std::string& ownerId
) {
    const auto ownerIt = players.find(ownerId);
    if (ownerIt == players.end()) {
        return 0;
    }

    return getPlayerHideRegionId(mapLoader, ownerIt->second);
}

bool isRectOutsideHideRegion(
    const MapLoader& mapLoader,
    int ownerHideRegionId,
    float centerX,
    float centerY,
    float width,
    float height,
    float threshold = 1.0f
) {
    if (ownerHideRegionId <= 0) {
        return true;
    }

    const auto samples = buildRectSamples(centerX, centerY, width, height);
    int outsideCount = 0;
    for (const auto& [sampleX, sampleY] : samples) {
        if (mapLoader.getHideRegionIdAtWorldPoint(sampleX, sampleY) != ownerHideRegionId) {
            outsideCount += 1;
        }
    }

    return static_cast<float>(outsideCount) / static_cast<float>(samples.size()) >= threshold;
}

EffectVisualSpec getEffectVisualSpec(const std::string& spellId) {
    if (spellId == "poison_flash") {
        return {EffectVisualSpec::Kind::LineBurst, 64.0f, 64.0f, 1.0f, 5, 0, 0};
    }
    if (spellId == "seed_bite") {
        return {EffectVisualSpec::Kind::TileBurst, 64.0f, 64.0f, 1.0f, 0, 0, 3};
    }
    if (spellId == "poison_shield") {
        return {EffectVisualSpec::Kind::SelfAura, 256.0f, 256.0f, 0.5f, 0, 0, 0};
    }
    if (spellId == "flamethrower") {
        return {EffectVisualSpec::Kind::Beam, 129.0f, 192.0f, 1.0f, 0, 6, 0};
    }
    return {};
}

json buildFilteredAreaEffectsJson(
    const std::vector<ActiveAreaEffect>& areaEffects,
    const std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    json result = json::array();

    for (const auto& effect : areaEffects) {
        const int ownerHideRegionId = getOwnerHideRegionId(players, mapLoader, effect.ownerId);
        const bool ownerVisible =
            ownerHideRegionId <= 0 ||
            isPlayerVisibleToObserver(players, mapLoader, observerId, effect.ownerId, revealedUntilByPlayerId, nowMs);

        json payload = {
            {"id", effect.id},
            {"ownerId", effect.ownerId},
            {"spellId", effect.spellId},
            {"x", effect.originX},
            {"y", effect.originY},
            {"angle", effect.angle},
            {"startTimeMs", effect.startTimeMs},
            {"endTimeMs", effect.endTimeMs}
        };

        const EffectVisualSpec spec = getEffectVisualSpec(effect.spellId);
        if (ownerVisible || ownerHideRegionId <= 0 || spec.kind == EffectVisualSpec::Kind::Unknown) {
            result.push_back(payload);
            continue;
        }

        if (spec.kind == EffectVisualSpec::Kind::SelfAura) {
            const float radiusWidth = spec.width * spec.scale;
            const float radiusHeight = spec.height * spec.scale;
            if (isRectOutsideHideRegion(
                mapLoader,
                ownerHideRegionId,
                effect.originX,
                effect.originY,
                radiusWidth,
                radiusHeight,
                HIDE_EFFECT_VISIBILITY_THRESHOLD
            )) {
                result.push_back(payload);
            }
            continue;
        }

        if (spec.kind == EffectVisualSpec::Kind::LineBurst) {
            json visibleSteps = json::array();
            const float forwardX = std::cos(effect.angle);
            const float forwardY = std::sin(effect.angle);
            for (int step = 1; step <= spec.lineSteps; ++step) {
                if (isRectOutsideHideRegion(
                    mapLoader,
                    ownerHideRegionId,
                    effect.originX + forwardX * spec.width * static_cast<float>(step),
                    effect.originY + forwardY * spec.height * static_cast<float>(step),
                    spec.width,
                    spec.height,
                    HIDE_EFFECT_VISIBILITY_THRESHOLD
                )) {
                    visibleSteps.push_back(step);
                }
            }

            if (!visibleSteps.empty()) {
                payload["visibleLineSteps"] = visibleSteps;
                result.push_back(payload);
            }
            continue;
        }

        if (spec.kind == EffectVisualSpec::Kind::TileBurst) {
            json visibleTileOffsets = json::array();
            for (int tileY = -spec.tileRadius; tileY <= spec.tileRadius; ++tileY) {
                for (int tileX = -spec.tileRadius; tileX <= spec.tileRadius; ++tileX) {
                    if (isRectOutsideHideRegion(
                        mapLoader,
                        ownerHideRegionId,
                        effect.originX + static_cast<float>(tileX) * spec.width,
                        effect.originY + static_cast<float>(tileY) * spec.height,
                        spec.width,
                        spec.height,
                        HIDE_EFFECT_VISIBILITY_THRESHOLD
                    )) {
                        visibleTileOffsets.push_back(json::array({tileX, tileY}));
                    }
                }
            }

            if (!visibleTileOffsets.empty()) {
                payload["visibleTileOffsets"] = visibleTileOffsets;
                result.push_back(payload);
            }
            continue;
        }

        if (spec.kind == EffectVisualSpec::Kind::Beam) {
            json visibleBeamSlices = json::array();
            const float forwardX = std::cos(effect.angle);
            const float forwardY = std::sin(effect.angle);
            for (int sliceIndex = 0; sliceIndex < spec.beamSlices; ++sliceIndex) {
                const float centerDistance = (static_cast<float>(sliceIndex) + 0.5f) * spec.height * 0.25f;
                if (isRectOutsideHideRegion(
                    mapLoader,
                    ownerHideRegionId,
                    effect.originX + forwardX * centerDistance,
                    effect.originY + forwardY * centerDistance,
                    spec.width,
                    spec.height / static_cast<float>(spec.beamSlices),
                    HIDE_EFFECT_VISIBILITY_THRESHOLD
                )) {
                    visibleBeamSlices.push_back(sliceIndex);
                }
            }

            if (!visibleBeamSlices.empty()) {
                payload["visibleBeamSlices"] = visibleBeamSlices;
                result.push_back(payload);
            }
            continue;
        }
    }

    return result;
}

json buildFilteredPlayersJson(
    const std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    json result = json::object();
    for (const auto& [id, player] : players) {
        if (!isPlayerVisibleToObserver(players, mapLoader, observerId, id, revealedUntilByPlayerId, nowMs)) {
            continue;
        }
        result[id] = player.to_json();
    }
    return result;
}

json buildFilteredProjectilesJson(
    const std::vector<ActiveProjectile>& projectiles,
    const std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    json result = json::array();
    for (const auto& projectile : projectiles) {
        const int ownerHideRegionId = getOwnerHideRegionId(players, mapLoader, projectile.ownerId);
        const bool ownerVisible =
            ownerHideRegionId <= 0 ||
            isPlayerVisibleToObserver(players, mapLoader, observerId, projectile.ownerId, revealedUntilByPlayerId, nowMs);

        if (!ownerVisible) {
            const auto& spell = GameConfig::getSpellDefinition(projectile.spellId);
            const float projectileSize = std::max(64.0f, spell.projectileRadius * 2.0f);
            if (!isRectOutsideHideRegion(
                mapLoader,
                ownerHideRegionId,
                projectile.x,
                projectile.y,
                projectileSize,
                projectileSize,
                HIDE_EFFECT_VISIBILITY_THRESHOLD
            )) {
                continue;
            }
        }

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

json buildFilteredBurnStatusesJson(
    const std::vector<ActiveBurnStatus>& statuses,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    json result = json::array();
    for (const auto& status : statuses) {
        if (status.targetType == "player") {
            const auto playerIt = players.find(status.targetId);
            if (playerIt == players.end() || !isPlayerVisibleToObserver(players, mapLoader, observerId, status.targetId, revealedUntilByPlayerId, nowMs)) {
                continue;
            }
        } else if (status.targetType == "dummy") {
            if (!dummies.count(status.targetId)) {
                continue;
            }
        }

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

json buildFilteredBurnZonesJson(
    const std::vector<BurnZone>& zones,
    const std::map<std::string, Player>& players,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    json result = json::array();
    for (const auto& zone : zones) {
        const int ownerHideRegionId = getOwnerHideRegionId(players, mapLoader, zone.ownerId);
        const bool ownerVisible =
            ownerHideRegionId <= 0 ||
            isPlayerVisibleToObserver(players, mapLoader, observerId, zone.ownerId, revealedUntilByPlayerId, nowMs);

        if (!ownerVisible) {
            if (!isRectOutsideHideRegion(
                mapLoader,
                ownerHideRegionId,
                zone.x + zone.size / 2.0f,
                zone.y + zone.size / 2.0f,
                zone.size,
                zone.size,
                HIDE_EFFECT_VISIBILITY_THRESHOLD
            )) {
                continue;
            }
        }

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
}

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

json WorldSnapshotBuilder::buildAreaEffectsJson(const std::vector<ActiveAreaEffect>& areaEffects) {
    json result = json::array();
    for (const auto& effect : areaEffects) {
        result.push_back({
            {"id", effect.id},
            {"ownerId", effect.ownerId},
            {"spellId", effect.spellId},
            {"x", effect.originX},
            {"y", effect.originY},
            {"angle", effect.angle},
            {"startTimeMs", effect.startTimeMs},
            {"endTimeMs", effect.endTimeMs}
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
    const std::vector<ActiveAreaEffect>& areaEffects,
    const std::vector<ActiveBurnStatus>& burnStatuses,
    const std::vector<BurnZone>& burnZones
) {
    return {
        {"tick", tick},
        {"players", buildPlayersJson(players)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildProjectilesJson(projectiles)},
        {"areaEffects", buildAreaEffectsJson(areaEffects)},
        {"burnStatuses", buildBurnStatusesJson(burnStatuses)},
        {"burnZones", buildBurnZonesJson(burnZones)}
    };
}

json WorldSnapshotBuilder::buildWorldSnapshot(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles,
    const std::vector<ActiveAreaEffect>& areaEffects,
    const std::vector<ActiveBurnStatus>& burnStatuses,
    const std::vector<BurnZone>& burnZones
) {
    return {
        {"event", "worldSnapshot"},
        {"tick", tick},
        {"players", buildPlayersJson(players)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildProjectilesJson(projectiles)},
        {"areaEffects", buildAreaEffectsJson(areaEffects)},
        {"burnStatuses", buildBurnStatusesJson(burnStatuses)},
        {"burnZones", buildBurnZonesJson(burnZones)}
    };
}

json WorldSnapshotBuilder::buildWorldStateForObserver(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles,
    const std::vector<ActiveAreaEffect>& areaEffects,
    const std::vector<ActiveBurnStatus>& burnStatuses,
    const std::vector<BurnZone>& burnZones,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    return {
        {"tick", tick},
        {"players", buildFilteredPlayersJson(players, mapLoader, observerId, revealedUntilByPlayerId, nowMs)},
        {"dummies", buildDummiesJson(dummies)},
        {"projectiles", buildFilteredProjectilesJson(projectiles, players, mapLoader, observerId, revealedUntilByPlayerId, nowMs)},
        {"areaEffects", buildFilteredAreaEffectsJson(areaEffects, players, mapLoader, observerId, revealedUntilByPlayerId, nowMs)},
        {"burnStatuses", buildFilteredBurnStatusesJson(burnStatuses, players, dummies, mapLoader, observerId, revealedUntilByPlayerId, nowMs)},
        {"burnZones", buildFilteredBurnZonesJson(burnZones, players, mapLoader, observerId, revealedUntilByPlayerId, nowMs)}
    };
}

json WorldSnapshotBuilder::buildWorldSnapshotForObserver(
    unsigned long long tick,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& projectiles,
    const std::vector<ActiveAreaEffect>& areaEffects,
    const std::vector<ActiveBurnStatus>& burnStatuses,
    const std::vector<BurnZone>& burnZones,
    const MapLoader& mapLoader,
    const std::string& observerId,
    const std::unordered_map<std::string, long long>& revealedUntilByPlayerId,
    long long nowMs
) {
    json snapshot = buildWorldStateForObserver(
        tick,
        players,
        dummies,
        projectiles,
        areaEffects,
        burnStatuses,
        burnZones,
        mapLoader,
        observerId,
        revealedUntilByPlayerId,
        nowMs
    );
    snapshot["event"] = "worldSnapshot";
    return snapshot;
}
