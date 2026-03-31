#include "ProjectileSystem.h"
#include "BurnSystem.h"
#include "CombatSystem.h"
#include "GameConfig.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <algorithm>
#include <cmath>

namespace {
constexpr int FLAMETHROWER_TICK_COUNT = 6;
constexpr long long FIRE_BLAST_REHIT_INTERVAL_MS = 1000;

float getFlamethrowerHalfWidthAtDistance(float axialDistance, float maxRange, float maxHalfWidth) {
    if (maxRange <= 0.0f) {
        return maxHalfWidth;
    }

    const float t = std::clamp(axialDistance / maxRange, 0.0f, 1.0f);
    return 0.5f + (maxHalfWidth - 0.5f) * t;
}

bool isInsideFlamethrower(
    float targetCenterX,
    float targetCenterY,
    float targetRadius,
    const ActiveAreaEffect& effect,
    const SpellDefinition& spell
) {
    const float dx = targetCenterX - effect.originX;
    const float dy = targetCenterY - effect.originY;
    const float forwardX = std::cos(effect.angle);
    const float forwardY = std::sin(effect.angle);
    const float rightX = -forwardY;
    const float rightY = forwardX;

    const float axial = dx * forwardX + dy * forwardY;
    if (axial < -targetRadius || axial > spell.range + targetRadius) {
        return false;
    }

    const float lateral = std::abs(dx * rightX + dy * rightY);
    const float maxHalfWidth = getFlamethrowerHalfWidthAtDistance(std::max(0.0f, axial), spell.range, spell.projectileRadius);
    return lateral <= maxHalfWidth + targetRadius;
}

bool isPersistentProjectile(const std::string& spellId) {
    return spellId == "fire_blast";
}
}

void ProjectileSystem::releasePendingAutoAttacks(
    std::map<std::string, Player>& players,
    std::vector<PendingAutoAttack>& pendingAutoAttacks,
    std::vector<ActiveProjectile>& activeProjectiles,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    std::vector<PendingAutoAttack> remaining;
    remaining.reserve(pendingAutoAttacks.size());

    for (const auto& cast : pendingAutoAttacks) {
        if (cast.releaseTimeMs > nowMs) {
            remaining.push_back(cast);
            continue;
        }

        if (!players.count(cast.playerId) || players[cast.playerId].hp <= 0) {
            continue;
        }

        activeProjectiles.push_back({
            cast.projectileId,
            cast.playerId,
            cast.spellId,
            cast.originX,
            cast.originY,
            cast.angle,
            0.0f,
            0.0f,
            {},
            {}
        });

        if (network) {
            ServerDiagnostics::logCombatEvent("projectileSpawned", {
                {"tick", worldTick},
                {"projectileId", cast.projectileId},
                {"ownerId", cast.playerId},
                {"spellId", cast.spellId}
            });
            network->broadcast(json({
                {"event", "projectileSpawned"},
                {"tick", worldTick},
                {"projectile", {
                    {"id", cast.projectileId},
                    {"ownerId", cast.playerId},
                    {"spellId", cast.spellId},
                    {"x", cast.originX},
                    {"y", cast.originY},
                    {"angle", cast.angle}
                }}
            }).dump());
        }
    }

    pendingAutoAttacks = std::move(remaining);
}

void ProjectileSystem::updateProjectiles(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
    std::vector<ActiveProjectile>& activeProjectiles,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    std::vector<BurnZone>& burnZones,
    const MapLoader& mapLoader,
    const WorldDefinition& worldDefinition,
    unsigned long long worldTick,
    float deltaSeconds,
    long long nowMs,
    NetworkHandler* network
) {
    std::vector<ActiveProjectile> remaining;
    remaining.reserve(activeProjectiles.size());

    for (auto projectile : activeProjectiles) {
        if (!players.count(projectile.ownerId)) {
            if (network) {
                network->broadcast(json({{"event", "projectileRemoved"}, {"tick", worldTick}, {"id", projectile.id}}).dump());
            }
            continue;
        }

        const auto& spell = GameConfig::getSpellDefinition(projectile.spellId);
        if (spell.projectileSpeed <= 0.0f) {
            continue;
        }

        float step = spell.projectileSpeed * deltaSeconds;
        projectile.x += std::cos(projectile.angle) * step;
        projectile.y += std::sin(projectile.angle) * step;
        projectile.distanceTravelled += step;

        if (projectile.spellId == "fire_blast" && players.count(projectile.ownerId)) {
            const auto& owner = players[projectile.ownerId];
            if (!owner.passiveId.empty()) {
                BurnSystem::spawnTrailZones(
                    projectile,
                    GameConfig::getPassiveDefinition(owner.passiveId),
                    burnZones,
                    nowMs
                );
            }
        }

        bool removeProjectile = false;

        if (projectile.distanceTravelled >= spell.range) {
            removeProjectile = true;
        } else if (mapLoader.isLoaded() && mapLoader.isBlocked(
            projectile.x - spell.projectileRadius,
            projectile.y - spell.projectileRadius,
            spell.projectileRadius * 2.0f,
            spell.projectileRadius * 2.0f)) {
            removeProjectile = true;
        }

        if (!removeProjectile) {
            for (auto& [targetId, target] : players) {
                if (targetId == projectile.ownerId || target.hp <= 0) continue;

                float targetCenterX = target.x + target.colliderWidth / 2.0f;
                float targetCenterY = target.y + target.colliderHeight / 2.0f;
                float targetRadius = std::max(target.colliderWidth, target.colliderHeight) / 2.0f;
                float distance = std::hypot(targetCenterX - projectile.x, targetCenterY - projectile.y);

                if (distance <= targetRadius + spell.projectileRadius) {
                    if (isPersistentProjectile(projectile.spellId)) {
                        const long long lastHit = projectile.playerHitTimes.count(targetId)
                            ? projectile.playerHitTimes[targetId]
                            : (nowMs - FIRE_BLAST_REHIT_INTERVAL_MS);
                        if (nowMs - lastHit < FIRE_BLAST_REHIT_INTERVAL_MS) {
                            continue;
                        }
                        projectile.playerHitTimes[targetId] = nowMs;
                    }

                    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &players[projectile.ownerId], spell.damage, true);
                    removeProjectile = !isPersistentProjectile(projectile.spellId);
                    ServerDiagnostics::logCombatEvent("projectileHitPlayer", {
                        {"tick", worldTick},
                        {"projectileId", projectile.id},
                        {"targetId", targetId},
                        {"ownerId", projectile.ownerId},
                        {"damage", spell.damage},
                        {"killed", damageResult.killed}
                    });

                    if (network) {
                        network->broadcast(json({{"event", "playerDamaged"}, {"tick", worldTick}, {"id", targetId}, {"hp", damageResult.newHp}}).dump());
                        if (damageResult.killed) {
                            network->broadcast(json({
                                {"event", "playerScored"},
                                {"tick", worldTick},
                                {"victimId", targetId},
                                {"attackerId", projectile.ownerId},
                                {"targetDeaths", damageResult.victimDeaths},
                                {"attackerKills", damageResult.attackerKills}
                            }).dump());
                        }
                    }
                    BurnSystem::tryApplyToPlayer(target, players[projectile.ownerId], projectile.spellId, activeBurnStatuses, worldTick, nowMs, network);
                    if (removeProjectile) {
                        break;
                    }
                }
            }
        }

        if (!removeProjectile) {
            for (auto& [dummyId, dummy] : dummies) {
                if (dummy.hp <= 0) continue;

                float distance = std::hypot(dummy.x - projectile.x, dummy.y - projectile.y);
                if (distance <= (worldDefinition.dummyColliderSize / 2.0f) + spell.projectileRadius) {
                    if (isPersistentProjectile(projectile.spellId)) {
                        const long long lastHit = projectile.dummyHitTimes.count(dummyId)
                            ? projectile.dummyHitTimes[dummyId]
                            : (nowMs - FIRE_BLAST_REHIT_INTERVAL_MS);
                        if (nowMs - lastHit < FIRE_BLAST_REHIT_INTERVAL_MS) {
                            continue;
                        }
                        projectile.dummyHitTimes[dummyId] = nowMs;
                    }

                    DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, spell.damage, nowMs);
                    removeProjectile = !isPersistentProjectile(projectile.spellId);
                    ServerDiagnostics::logCombatEvent("projectileHitDummy", {
                        {"tick", worldTick},
                        {"projectileId", projectile.id},
                        {"dummyId", dummyId},
                        {"ownerId", projectile.ownerId},
                        {"damage", spell.damage},
                        {"killed", damageResult.killed}
                    });

                    if (network) {
                        network->broadcast(json({{"event", "dummyDamaged"}, {"tick", worldTick}, {"id", dummyId}, {"hp", damageResult.newHp}}).dump());
                    }
                    BurnSystem::tryApplyToDummy(dummy, players[projectile.ownerId], projectile.spellId, activeBurnStatuses, worldTick, nowMs, network);
                    if (removeProjectile) {
                        break;
                    }
                }
            }
        }

        if (removeProjectile) {
            if (network) {
                network->broadcast(json({{"event", "projectileRemoved"}, {"tick", worldTick}, {"id", projectile.id}}).dump());
            }
            continue;
        }

        remaining.push_back(projectile);
    }

    activeProjectiles = std::move(remaining);
}

void ProjectileSystem::updateAreaEffects(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
    std::vector<ActiveAreaEffect>& activeAreaEffects,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    const WorldDefinition& worldDefinition,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    std::vector<ActiveAreaEffect> remaining;
    remaining.reserve(activeAreaEffects.size());

    for (auto effect : activeAreaEffects) {
        if (!players.count(effect.ownerId) || players[effect.ownerId].hp <= 0) {
            continue;
        }

        const auto& spell = GameConfig::getSpellDefinition(effect.spellId);
        if (nowMs >= effect.endTimeMs) {
            continue;
        }

        if (nowMs < effect.startTimeMs) {
            remaining.push_back(effect);
            continue;
        }

        const int tickDamage = std::max(1, spell.damage / FLAMETHROWER_TICK_COUNT);
        const int tickIntervalMs = std::max(1, spell.effectDurationMs / FLAMETHROWER_TICK_COUNT);

        while (effect.nextTickTimeMs <= nowMs && effect.ticksApplied < FLAMETHROWER_TICK_COUNT) {
            for (auto& [targetId, target] : players) {
                if (targetId == effect.ownerId || target.hp <= 0) {
                    continue;
                }

                const float targetCenterX = target.x + target.colliderWidth / 2.0f;
                const float targetCenterY = target.y + target.colliderHeight / 2.0f;
                const float targetRadius = std::max(target.colliderWidth, target.colliderHeight) / 2.0f;
                if (!isInsideFlamethrower(targetCenterX, targetCenterY, targetRadius, effect, spell)) {
                    continue;
                }

                PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &players[effect.ownerId], tickDamage, true);
                ServerDiagnostics::logCombatEvent("areaEffectHitPlayer", {
                    {"tick", worldTick},
                    {"effectId", effect.id},
                    {"spellId", effect.spellId},
                    {"targetId", targetId},
                    {"ownerId", effect.ownerId},
                    {"damage", tickDamage},
                    {"tickIndex", effect.ticksApplied},
                    {"killed", damageResult.killed}
                });

                if (network) {
                    network->broadcast(json({{"event", "playerDamaged"}, {"tick", worldTick}, {"id", targetId}, {"hp", damageResult.newHp}}).dump());
                    if (damageResult.killed) {
                        network->broadcast(json({
                            {"event", "playerScored"},
                            {"tick", worldTick},
                            {"victimId", targetId},
                            {"attackerId", effect.ownerId},
                            {"targetDeaths", damageResult.victimDeaths},
                            {"attackerKills", damageResult.attackerKills}
                        }).dump());
                    }
                }
                BurnSystem::tryApplyToPlayer(target, players[effect.ownerId], effect.spellId, activeBurnStatuses, worldTick, nowMs, network);
            }

            for (auto& [dummyId, dummy] : dummies) {
                if (dummy.hp <= 0) {
                    continue;
                }

                if (!isInsideFlamethrower(dummy.x, dummy.y, worldDefinition.dummyColliderSize / 2.0f, effect, spell)) {
                    continue;
                }

                DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, tickDamage, nowMs);
                ServerDiagnostics::logCombatEvent("areaEffectHitDummy", {
                    {"tick", worldTick},
                    {"effectId", effect.id},
                    {"spellId", effect.spellId},
                    {"dummyId", dummyId},
                    {"ownerId", effect.ownerId},
                    {"damage", tickDamage},
                    {"tickIndex", effect.ticksApplied},
                    {"killed", damageResult.killed}
                });

                if (network) {
                    network->broadcast(json({{"event", "dummyDamaged"}, {"tick", worldTick}, {"id", dummyId}, {"hp", damageResult.newHp}}).dump());
                }
                BurnSystem::tryApplyToDummy(dummy, players[effect.ownerId], effect.spellId, activeBurnStatuses, worldTick, nowMs, network);
            }

            effect.ticksApplied += 1;
            effect.nextTickTimeMs += tickIntervalMs;
        }

        if (effect.ticksApplied < FLAMETHROWER_TICK_COUNT && nowMs < effect.endTimeMs) {
            remaining.push_back(effect);
        }
    }

    activeAreaEffects = std::move(remaining);
}
