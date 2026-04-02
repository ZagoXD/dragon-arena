#include "BurnSystem.h"
#include "CombatSystem.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>

namespace {
constexpr float FIRE_BLAST_TRAIL_SPACING = 64.0f;
constexpr float FIRE_BLAST_TRAIL_HALF_WIDTH = 32.0f;

std::string makeBurnId(const std::string& prefix, const std::string& targetId, long long nowMs) {
    static long long sequence = 0;
    return prefix + "_" + targetId + "_" + std::to_string(nowMs) + "_" + std::to_string(sequence++);
}

bool rollChance(float chancePercent) {
    if (chancePercent >= 100.0f) {
        return true;
    }
    if (chancePercent <= 0.0f) {
        return false;
    }

    const float roll = static_cast<float>(std::rand() % 10000) / 100.0f;
    return roll < chancePercent;
}

bool hasActiveBurnStatus(
    const std::vector<ActiveBurnStatus>& activeBurnStatuses,
    const std::string& targetType,
    const std::string& targetId,
    long long nowMs
) {
    for (const auto& status : activeBurnStatuses) {
        if (status.targetType == targetType && status.targetId == targetId && status.endTimeMs > nowMs) {
            return true;
        }
    }
    return false;
}

void broadcastApplied(NetworkHandler* network, unsigned long long worldTick, const json& payload) {
    if (!network) {
        return;
    }
    json message = payload;
    message["event"] = "burnApplied";
    message["tick"] = worldTick;
    network->broadcast(message.dump());
}

void applyToPlayerInternal(
    Player& target,
    Player& attacker,
    const PassiveDefinition& passive,
    const std::string& sourceSpellId,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    const auto chanceIt = passive.applicationChances.find(sourceSpellId);
    const float chance = chanceIt != passive.applicationChances.end() ? chanceIt->second : 0.0f;
    if (!rollChance(chance) || hasActiveBurnStatus(activeBurnStatuses, "player", target.id, nowMs)) {
        return;
    }

    activeBurnStatuses.push_back({
        makeBurnId("burn_player", target.id, nowMs),
        "player",
        target.id,
        attacker.id,
        passive.id,
        nowMs,
        nowMs + passive.durationMs,
        nowMs + passive.tickIntervalMs
    });

    ServerDiagnostics::logCombatEvent("burnAppliedToPlayer", {
        {"tick", worldTick},
        {"targetId", target.id},
        {"ownerId", attacker.id},
        {"sourceSpellId", sourceSpellId},
        {"passiveId", passive.id}
    });
    broadcastApplied(network, worldTick, {
        {"targetType", "player"},
        {"targetId", target.id},
        {"ownerId", attacker.id},
        {"passiveId", passive.id},
        {"durationMs", passive.durationMs}
    });
}

void applyToDummyInternal(
    DummyEntity& target,
    Player& attacker,
    const PassiveDefinition& passive,
    const std::string& sourceSpellId,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    const auto chanceIt = passive.applicationChances.find(sourceSpellId);
    const float chance = chanceIt != passive.applicationChances.end() ? chanceIt->second : 0.0f;
    if (!rollChance(chance) || hasActiveBurnStatus(activeBurnStatuses, "dummy", target.id, nowMs)) {
        return;
    }

    activeBurnStatuses.push_back({
        makeBurnId("burn_dummy", target.id, nowMs),
        "dummy",
        target.id,
        attacker.id,
        passive.id,
        nowMs,
        nowMs + passive.durationMs,
        nowMs + passive.tickIntervalMs
    });

    ServerDiagnostics::logCombatEvent("burnAppliedToDummy", {
        {"tick", worldTick},
        {"dummyId", target.id},
        {"ownerId", attacker.id},
        {"sourceSpellId", sourceSpellId},
        {"passiveId", passive.id}
    });
    broadcastApplied(network, worldTick, {
        {"targetType", "dummy"},
        {"targetId", target.id},
        {"ownerId", attacker.id},
        {"passiveId", passive.id},
        {"durationMs", passive.durationMs}
    });
}
}

void BurnSystem::tryApplyToPlayer(
    Player& target,
    Player& attacker,
    const std::string& sourceSpellId,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    if (attacker.passiveId.empty()) {
        return;
    }

    applyToPlayerInternal(
        target,
        attacker,
        GameConfig::getPassiveDefinition(attacker.passiveId),
        sourceSpellId,
        activeBurnStatuses,
        worldTick,
        nowMs,
        network
    );
}

void BurnSystem::tryApplyToDummy(
    DummyEntity& target,
    Player& attacker,
    const std::string& sourceSpellId,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    if (attacker.passiveId.empty()) {
        return;
    }

    applyToDummyInternal(
        target,
        attacker,
        GameConfig::getPassiveDefinition(attacker.passiveId),
        sourceSpellId,
        activeBurnStatuses,
        worldTick,
        nowMs,
        network
    );
}

void BurnSystem::spawnTrailZones(
    ActiveProjectile& projectile,
    const PassiveDefinition& passive,
    std::vector<BurnZone>& burnZones,
    long long nowMs
) {
    while (projectile.lastTrailPlacementDistance + FIRE_BLAST_TRAIL_SPACING <= projectile.distanceTravelled) {
        projectile.lastTrailPlacementDistance += FIRE_BLAST_TRAIL_SPACING;
        const float trailX = projectile.x - std::cos(projectile.angle) * (projectile.distanceTravelled - projectile.lastTrailPlacementDistance);
        const float trailY = projectile.y - std::sin(projectile.angle) * (projectile.distanceTravelled - projectile.lastTrailPlacementDistance);
        const float rightX = -std::sin(projectile.angle);
        const float rightY = std::cos(projectile.angle);

        for (int side = -1; side <= 1; side += 2) {
            const float zoneX = std::floor((trailX + rightX * FIRE_BLAST_TRAIL_HALF_WIDTH * static_cast<float>(side)) / 64.0f) * 64.0f + 32.0f;
            const float zoneY = std::floor((trailY + rightY * FIRE_BLAST_TRAIL_HALF_WIDTH * static_cast<float>(side)) / 64.0f) * 64.0f + 32.0f;

            burnZones.push_back({
                makeBurnId("burn_zone", projectile.id, nowMs),
                projectile.ownerId,
                passive.id,
                zoneX,
                zoneY,
                64.0f,
                nowMs,
                nowMs + passive.durationMs,
                nowMs + passive.tickIntervalMs
            });
        }
    }
}

void BurnSystem::updateBurnStatuses(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    std::vector<ActiveBurnStatus> remaining;
    remaining.reserve(activeBurnStatuses.size());

    for (auto status : activeBurnStatuses) {
        if (status.endTimeMs <= nowMs) {
            continue;
        }

        const auto& passive = GameConfig::getPassiveDefinition(status.passiveId);
        while (status.nextTickTimeMs <= nowMs) {
            if (status.targetType == "player") {
                auto targetIt = players.find(status.targetId);
                auto ownerIt = players.find(status.ownerId);
                if (targetIt != players.end() && ownerIt != players.end() && targetIt->second.hp > 0) {
                    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(targetIt->second, &ownerIt->second, passive.tickDamage, true);
                    ServerDiagnostics::logCombatEvent("burnTickPlayer", {
                        {"tick", worldTick},
                        {"targetId", status.targetId},
                        {"ownerId", status.ownerId},
                        {"damage", passive.tickDamage}
                    });
                    if (network) {
                        network->broadcast(json({
                            {"event", "playerDamaged"},
                            {"tick", worldTick},
                            {"id", status.targetId},
                            {"hp", damageResult.newHp}
                        }).dump());
                        if (damageResult.killed) {
                            network->broadcast(json({
                                {"event", "playerScored"},
                                {"tick", worldTick},
                                {"victimId", status.targetId},
                                {"attackerId", status.ownerId},
                                {"targetDeaths", damageResult.victimDeaths},
                                {"attackerKills", damageResult.attackerKills}
                            }).dump());
                        }
                    }
                }
            } else if (status.targetType == "dummy") {
                auto targetIt = dummies.find(status.targetId);
                if (targetIt != dummies.end() && targetIt->second.hp > 0) {
                    DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(targetIt->second, passive.tickDamage, nowMs);
                    ServerDiagnostics::logCombatEvent("burnTickDummy", {
                        {"tick", worldTick},
                        {"dummyId", status.targetId},
                        {"ownerId", status.ownerId},
                        {"damage", passive.tickDamage}
                    });
                    if (network) {
                        network->broadcast(json({
                            {"event", "dummyDamaged"},
                            {"tick", worldTick},
                            {"id", status.targetId},
                            {"hp", damageResult.newHp}
                        }).dump());
                    }
                }
            }

            status.nextTickTimeMs += passive.tickIntervalMs;
        }

        remaining.push_back(status);
    }

    activeBurnStatuses = std::move(remaining);
}

void BurnSystem::refreshPlayerMovementModifiers(
    std::map<std::string, Player>& players,
    const std::vector<ActiveBurnStatus>& activeBurnStatuses,
    long long nowMs
) {
    for (auto& [playerId, player] : players) {
        float maxSlowPct = 0.0f;

        for (const auto& status : activeBurnStatuses) {
            if (status.targetType != "player" || status.targetId != playerId || status.endTimeMs <= nowMs) {
                continue;
            }

            const auto& passive = GameConfig::getPassiveDefinition(status.passiveId);
            maxSlowPct = std::max(maxSlowPct, passive.movementSlowPct);
        }

        player.movementSpeed = std::max(1.0f, player.baseMovementSpeed * (1.0f - maxSlowPct));
    }
}

void BurnSystem::updateBurnZones(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
    std::vector<BurnZone>& burnZones,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    std::vector<BurnZone> remaining;
    remaining.reserve(burnZones.size());

    for (auto zone : burnZones) {
        if (zone.endTimeMs <= nowMs) {
            continue;
        }

        const auto& passive = GameConfig::getPassiveDefinition(zone.passiveId);
        while (zone.nextTickTimeMs <= nowMs) {
            const float halfSize = zone.size / 2.0f;

            for (auto& [playerId, player] : players) {
                if (player.hp <= 0) {
                    continue;
                }

                const float centerX = player.x + player.colliderWidth / 2.0f;
                const float centerY = player.y + player.colliderHeight / 2.0f;
                if (std::abs(centerX - zone.x) > halfSize || std::abs(centerY - zone.y) > halfSize) {
                    continue;
                }

                auto ownerIt = players.find(zone.ownerId);
                if (ownerIt == players.end()) {
                    continue;
                }

                PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(player, &ownerIt->second, passive.tickDamage, true);
                ServerDiagnostics::logCombatEvent("burnZoneTickPlayer", {
                    {"tick", worldTick},
                    {"targetId", playerId},
                    {"ownerId", zone.ownerId},
                    {"damage", passive.tickDamage},
                    {"zoneId", zone.id}
                });
                if (network) {
                    network->broadcast(json({
                        {"event", "playerDamaged"},
                        {"tick", worldTick},
                        {"id", playerId},
                        {"hp", damageResult.newHp}
                    }).dump());
                    if (damageResult.killed) {
                        network->broadcast(json({
                            {"event", "playerScored"},
                            {"tick", worldTick},
                            {"victimId", playerId},
                            {"attackerId", zone.ownerId},
                            {"targetDeaths", damageResult.victimDeaths},
                            {"attackerKills", damageResult.attackerKills}
                        }).dump());
                    }
                }
            }

            for (auto& [dummyId, dummy] : dummies) {
                if (dummy.hp <= 0) {
                    continue;
                }

                if (std::abs(dummy.x - zone.x) > halfSize || std::abs(dummy.y - zone.y) > halfSize) {
                    continue;
                }

                DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, passive.tickDamage, nowMs);
                ServerDiagnostics::logCombatEvent("burnZoneTickDummy", {
                    {"tick", worldTick},
                    {"dummyId", dummyId},
                    {"ownerId", zone.ownerId},
                    {"damage", passive.tickDamage},
                    {"zoneId", zone.id}
                });
                if (network) {
                    network->broadcast(json({
                        {"event", "dummyDamaged"},
                        {"tick", worldTick},
                        {"id", dummyId},
                        {"hp", damageResult.newHp}
                    }).dump());
                }
            }

            zone.nextTickTimeMs += passive.tickIntervalMs;
        }

        remaining.push_back(zone);
    }

    burnZones = std::move(remaining);
}
