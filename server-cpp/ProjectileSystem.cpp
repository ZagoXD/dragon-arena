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
constexpr int SEED_BITE_TICK_COUNT = 3;
constexpr int SEED_BITE_TICK_DAMAGE[SEED_BITE_TICK_COUNT] = {100, 220, 100};
constexpr long long SEED_BITE_TICK_TIMES_MS[SEED_BITE_TICK_COUNT] = {0, 750, 2000};
constexpr long long SEED_BITE_ROOT_DURATION_MS = 1250;
constexpr float POISON_FLASH_TILE_SIZE = 64.0f;
constexpr int POISON_FLASH_TILE_COUNT = 5;
constexpr float SCRATCH_START_OFFSET = 12.0f;
constexpr float SCRATCH_FORWARD_RANGE = 62.0f;
constexpr float SCRATCH_HALF_WIDTH = 34.0f;

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

bool isInsideScratch(
    float targetCenterX,
    float targetCenterY,
    float targetRadius,
    float originX,
    float originY,
    float angle
) {
    const float forwardX = std::cos(angle);
    const float forwardY = std::sin(angle);
    const float rightX = -forwardY;
    const float rightY = forwardX;

    const float scratchOriginX = originX + forwardX * SCRATCH_START_OFFSET;
    const float scratchOriginY = originY + forwardY * SCRATCH_START_OFFSET;
    const float dx = targetCenterX - scratchOriginX;
    const float dy = targetCenterY - scratchOriginY;
    const float axial = dx * forwardX + dy * forwardY;
    const float lateral = std::abs(dx * rightX + dy * rightY);

    return axial >= -targetRadius &&
           axial <= SCRATCH_FORWARD_RANGE + targetRadius &&
           lateral <= SCRATCH_HALF_WIDTH + targetRadius;
}

bool isInsideSeedBite(
    float targetCenterX,
    float targetCenterY,
    float targetRadius,
    const ActiveAreaEffect& effect,
    float tileSize
) {
    const float halfExtent = tileSize * 3.5f;
    return std::abs(targetCenterX - effect.originX) <= halfExtent + targetRadius &&
           std::abs(targetCenterY - effect.originY) <= halfExtent + targetRadius;
}

bool isInsidePoisonFlash(
    float targetCenterX,
    float targetCenterY,
    float targetRadius,
    const ActiveAreaEffect& effect
) {
    const float forwardX = std::cos(effect.angle);
    const float forwardY = std::sin(effect.angle);

    for (int step = 1; step <= POISON_FLASH_TILE_COUNT; step += 1) {
        const float tileCenterX = effect.originX + forwardX * POISON_FLASH_TILE_SIZE * static_cast<float>(step);
        const float tileCenterY = effect.originY + forwardY * POISON_FLASH_TILE_SIZE * static_cast<float>(step);
        if (std::abs(targetCenterX - tileCenterX) <= 32.0f + targetRadius &&
            std::abs(targetCenterY - tileCenterY) <= 32.0f + targetRadius) {
            return true;
        }
    }

    return false;
}

int scaleDamageForCharacter(const Player& player, int baseDamage) {
    const auto& definition = GameConfig::getCharacterDefinition(player.characterId);
    return std::max(1, static_cast<int>(std::round(static_cast<float>(baseDamage) * definition.damageMultiplier)));
}
}

void ProjectileSystem::releasePendingAutoAttacks(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
    std::vector<PendingAutoAttack>& pendingAutoAttacks,
    std::vector<ActiveProjectile>& activeProjectiles,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    const WorldDefinition& worldDefinition,
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

        const auto& spell = GameConfig::getSpellDefinition(cast.spellId);

        if (cast.spellId == "scratch") {
            Player& owner = players[cast.playerId];
            const int damage = scaleDamageForCharacter(owner, spell.damage);

            for (auto& [targetId, target] : players) {
                if (targetId == cast.playerId || target.hp <= 0) {
                    continue;
                }

                const float targetCenterX = target.x + target.colliderWidth / 2.0f;
                const float targetCenterY = target.y + target.colliderHeight / 2.0f;
                const float targetRadius = std::max(target.colliderWidth, target.colliderHeight) / 2.0f;
                if (!isInsideScratch(targetCenterX, targetCenterY, targetRadius, cast.originX, cast.originY, cast.angle)) {
                    continue;
                }

                PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &owner, damage, true);
                BurnSystem::tryApplyToPlayer(target, owner, cast.spellId, activeBurnStatuses, worldTick, nowMs, network);

                if (network) {
                    network->broadcast(json({
                        {"event", "playerDamaged"},
                        {"tick", worldTick},
                        {"id", targetId},
                        {"hp", damageResult.newHp},
                        {"attackerId", cast.playerId}
                    }).dump());
                    if (damageResult.killed) {
                        network->broadcast(json({
                            {"event", "playerScored"},
                            {"tick", worldTick},
                            {"victimId", targetId},
                            {"attackerId", cast.playerId},
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

                if (!isInsideScratch(dummy.x, dummy.y, worldDefinition.dummyColliderSize / 2.0f, cast.originX, cast.originY, cast.angle)) {
                    continue;
                }

                DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, damage, nowMs);
                BurnSystem::tryApplyToDummy(dummy, owner, cast.spellId, activeBurnStatuses, worldTick, nowMs, network);

                if (network) {
                    network->broadcast(json({
                        {"event", "dummyDamaged"},
                        {"tick", worldTick},
                        {"id", dummyId},
                        {"hp", damageResult.newHp}
                    }).dump());
                }
            }

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

                    const int damage = scaleDamageForCharacter(players[projectile.ownerId], spell.damage);
                    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &players[projectile.ownerId], damage, true);
                    removeProjectile = !isPersistentProjectile(projectile.spellId);
                    ServerDiagnostics::logCombatEvent("projectileHitPlayer", {
                        {"tick", worldTick},
                        {"projectileId", projectile.id},
                        {"targetId", targetId},
                        {"ownerId", projectile.ownerId},
                        {"damage", damage},
                        {"killed", damageResult.killed}
                    });

                    if (network) {
                        network->broadcast(json({{"event", "playerDamaged"}, {"tick", worldTick}, {"id", targetId}, {"hp", damageResult.newHp}, {"attackerId", projectile.ownerId}}).dump());
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

                    const int damage = scaleDamageForCharacter(players[projectile.ownerId], spell.damage);
                    DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, damage, nowMs);
                    removeProjectile = !isPersistentProjectile(projectile.spellId);
                    ServerDiagnostics::logCombatEvent("projectileHitDummy", {
                        {"tick", worldTick},
                        {"projectileId", projectile.id},
                        {"dummyId", dummyId},
                        {"ownerId", projectile.ownerId},
                        {"damage", damage},
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

        const int scaledBaseDamage = scaleDamageForCharacter(players[effect.ownerId], spell.damage);
        const int tickDamage = std::max(1, scaledBaseDamage / FLAMETHROWER_TICK_COUNT);
        const int tickIntervalMs = std::max(1, spell.effectDurationMs / FLAMETHROWER_TICK_COUNT);

        if (effect.spellId == "poison_flash") {
            if (effect.ticksApplied == 0) {
                for (auto& [targetId, target] : players) {
                    if (targetId == effect.ownerId || target.hp <= 0) {
                        continue;
                    }

                    const float targetCenterX = target.x + target.colliderWidth / 2.0f;
                    const float targetCenterY = target.y + target.colliderHeight / 2.0f;
                    const float targetRadius = std::max(target.colliderWidth, target.colliderHeight) / 2.0f;
                    if (!isInsidePoisonFlash(targetCenterX, targetCenterY, targetRadius, effect)) {
                        continue;
                    }

                    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &players[effect.ownerId], scaledBaseDamage, true);
                    BurnSystem::tryApplyToPlayer(target, players[effect.ownerId], effect.spellId, activeBurnStatuses, worldTick, nowMs, network);

                    ServerDiagnostics::logCombatEvent("poisonFlashHitPlayer", {
                        {"tick", worldTick},
                        {"effectId", effect.id},
                        {"targetId", targetId},
                        {"ownerId", effect.ownerId},
                        {"damage", scaledBaseDamage},
                        {"killed", damageResult.killed}
                    });

                    if (network) {
                        network->broadcast(json({
                            {"event", "playerDamaged"},
                            {"tick", worldTick},
                            {"id", targetId},
                            {"hp", damageResult.newHp},
                            {"attackerId", effect.ownerId}
                        }).dump());
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
                }

                for (auto& [dummyId, dummy] : dummies) {
                    if (dummy.hp <= 0) {
                        continue;
                    }

                    if (!isInsidePoisonFlash(dummy.x, dummy.y, worldDefinition.dummyColliderSize / 2.0f, effect)) {
                        continue;
                    }

                    DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, scaledBaseDamage, nowMs);
                    BurnSystem::tryApplyToDummy(dummy, players[effect.ownerId], effect.spellId, activeBurnStatuses, worldTick, nowMs, network);

                    ServerDiagnostics::logCombatEvent("poisonFlashHitDummy", {
                        {"tick", worldTick},
                        {"effectId", effect.id},
                        {"dummyId", dummyId},
                        {"ownerId", effect.ownerId},
                        {"damage", scaledBaseDamage},
                        {"killed", damageResult.killed}
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

                effect.ticksApplied = 1;
            }

            continue;
        }

        if (effect.spellId == "seed_bite") {
            while (effect.ticksApplied < SEED_BITE_TICK_COUNT &&
                   nowMs >= effect.startTimeMs + SEED_BITE_TICK_TIMES_MS[effect.ticksApplied]) {
                const int tickIndex = effect.ticksApplied;
                const int damage = SEED_BITE_TICK_DAMAGE[tickIndex];

                for (auto& [targetId, target] : players) {
                    if (targetId == effect.ownerId || target.hp <= 0) {
                        continue;
                    }

                    const float targetCenterX = target.x + target.colliderWidth / 2.0f;
                    const float targetCenterY = target.y + target.colliderHeight / 2.0f;
                    const float targetRadius = std::max(target.colliderWidth, target.colliderHeight) / 2.0f;
                    if (!isInsideSeedBite(targetCenterX, targetCenterY, targetRadius, effect, static_cast<float>(worldDefinition.tileSize))) {
                        continue;
                    }

                    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &players[effect.ownerId], damage, true);
                    if (tickIndex == 1) {
                        target.immobilizedUntilMs = std::max(target.immobilizedUntilMs, nowMs + SEED_BITE_ROOT_DURATION_MS);
                    }
                    if (tickIndex == 2) {
                        BurnSystem::tryApplyToPlayer(target, players[effect.ownerId], effect.spellId, activeBurnStatuses, worldTick, nowMs, network);
                    }

                    ServerDiagnostics::logCombatEvent("seedBiteHitPlayer", {
                        {"tick", worldTick},
                        {"effectId", effect.id},
                        {"targetId", targetId},
                        {"ownerId", effect.ownerId},
                        {"damage", damage},
                        {"tickIndex", tickIndex},
                        {"killed", damageResult.killed}
                    });

                    if (network) {
                        network->broadcast(json({
                            {"event", "playerDamaged"},
                            {"tick", worldTick},
                            {"id", targetId},
                            {"hp", damageResult.newHp},
                            {"attackerId", effect.ownerId}
                        }).dump());
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
                }

                for (auto& [dummyId, dummy] : dummies) {
                    if (dummy.hp <= 0) {
                        continue;
                    }

                    if (!isInsideSeedBite(dummy.x, dummy.y, worldDefinition.dummyColliderSize / 2.0f, effect, static_cast<float>(worldDefinition.tileSize))) {
                        continue;
                    }

                    DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, damage, nowMs);
                    if (tickIndex == 2) {
                        BurnSystem::tryApplyToDummy(dummy, players[effect.ownerId], effect.spellId, activeBurnStatuses, worldTick, nowMs, network);
                    }

                    ServerDiagnostics::logCombatEvent("seedBiteHitDummy", {
                        {"tick", worldTick},
                        {"effectId", effect.id},
                        {"dummyId", dummyId},
                        {"ownerId", effect.ownerId},
                        {"damage", damage},
                        {"tickIndex", tickIndex},
                        {"killed", damageResult.killed}
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

                effect.ticksApplied += 1;
            }

            if (effect.ticksApplied < SEED_BITE_TICK_COUNT && nowMs < effect.endTimeMs) {
                remaining.push_back(effect);
            }

            continue;
        }

        if (effect.spellId == "poison_shield") {
            remaining.push_back(effect);
            continue;
        }

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
                    network->broadcast(json({{"event", "playerDamaged"}, {"tick", worldTick}, {"id", targetId}, {"hp", damageResult.newHp}, {"attackerId", effect.ownerId}}).dump());
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
