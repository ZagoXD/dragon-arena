#include "ProjectileSystem.h"
#include "CombatSystem.h"
#include "GameConfig.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <algorithm>
#include <cmath>

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
            0.0f
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
                    PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &players[projectile.ownerId], spell.damage, true);
                    removeProjectile = true;
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
                    break;
                }
            }
        }

        if (!removeProjectile) {
            for (auto& [dummyId, dummy] : dummies) {
                if (dummy.hp <= 0) continue;

                float distance = std::hypot(dummy.x - projectile.x, dummy.y - projectile.y);
                if (distance <= (worldDefinition.dummyColliderSize / 2.0f) + spell.projectileRadius) {
                    DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, spell.damage, nowMs);
                    removeProjectile = true;
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
                    break;
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
