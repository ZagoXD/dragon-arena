#include "DashSystem.h"
#include "BurnSystem.h"
#include "CombatSystem.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <algorithm>
#include <cmath>

namespace {
int scaleDamageForCharacter(const Player& player, int baseDamage) {
    const auto& definition = GameConfig::getCharacterDefinition(player.characterId);
    return std::max(1, static_cast<int>(std::round(static_cast<float>(baseDamage) * definition.damageMultiplier)));
}
}

void DashSystem::updateDashes(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
    std::vector<ActiveBurnStatus>& activeBurnStatuses,
    const WorldDefinition& worldDefinition,
    unsigned long long worldTick,
    long long nowMs,
    NetworkHandler* network
) {
    const float dashCollisionRadius = static_cast<float>(worldDefinition.dummyColliderSize);
    const auto& dashSpell = GameConfig::getSpellDefinition("dragon_dive");

    for (auto& [playerId, player] : players) {
        if (!player.isDashing) {
            continue;
        }

        long long elapsed = nowMs - player.dashStartTime;
        float progress = player.dashDuration > 0
            ? std::min(1.0f, static_cast<float>(elapsed) / static_cast<float>(player.dashDuration))
            : 1.0f;

        player.x = player.dashStartX + (player.dashTargetX - player.dashStartX) * progress;
        player.y = player.dashStartY + (player.dashTargetY - player.dashStartY) * progress;

        for (auto& [otherId, target] : players) {
            if (otherId == playerId || target.hp <= 0) {
                continue;
            }

            bool alreadyHit = false;
            for (const auto& hitId : player.dashHitIds) {
                if (hitId == otherId) {
                    alreadyHit = true;
                    break;
                }
            }
            if (alreadyHit) {
                continue;
            }

            float playerCenterX = player.x + player.colliderWidth / 2.0f;
            float playerCenterY = player.y + player.colliderHeight / 2.0f;
            float targetCenterX = target.x + target.colliderWidth / 2.0f;
            float targetCenterY = target.y + target.colliderHeight / 2.0f;
            float hitDistance = (player.colliderWidth + target.colliderWidth) / 2.0f;
            float dx = targetCenterX - playerCenterX;
            float dy = targetCenterY - playerCenterY;

            if (std::sqrt(dx * dx + dy * dy) < hitDistance) {
                const int damage = scaleDamageForCharacter(player, dashSpell.damage);
                PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &player, damage, false);
                player.dashHitIds.push_back(otherId);
                ServerDiagnostics::logCombatEvent("dashHitPlayer", {
                    {"tick", worldTick},
                    {"playerId", playerId},
                    {"targetId", otherId},
                    {"damage", damage},
                    {"killed", damageResult.killed}
                });

                if (network) {
                    network->broadcast(json({
                        {"event", "playerDamaged"},
                        {"tick", worldTick},
                        {"id", otherId},
                        {"hp", damageResult.newHp},
                        {"attackerId", playerId}
                    }).dump());
                }
                BurnSystem::tryApplyToPlayer(target, player, "dragon_dive", activeBurnStatuses, worldTick, nowMs, network);
            }
        }

        for (auto& [dummyId, dummy] : dummies) {
            if (dummy.hp <= 0) {
                continue;
            }

            bool alreadyHit = false;
            for (const auto& hitId : player.dashHitIds) {
                if (hitId == dummyId) {
                    alreadyHit = true;
                    break;
                }
            }
            if (alreadyHit) {
                continue;
            }

            float playerCenterX = player.x + player.colliderWidth / 2.0f;
            float playerCenterY = player.y + player.colliderHeight / 2.0f;
            float dx = dummy.x - playerCenterX;
            float dy = dummy.y - playerCenterY;

            if (std::sqrt(dx * dx + dy * dy) < dashCollisionRadius) {
                const int damage = scaleDamageForCharacter(player, dashSpell.damage);
                DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, damage, nowMs);
                player.dashHitIds.push_back(dummyId);
                ServerDiagnostics::logCombatEvent("dashHitDummy", {
                    {"tick", worldTick},
                    {"playerId", playerId},
                    {"dummyId", dummyId},
                    {"damage", damage},
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
                BurnSystem::tryApplyToDummy(dummy, player, "dragon_dive", activeBurnStatuses, worldTick, nowMs, network);
            }
        }

        if (progress >= 1.0f) {
            player.isDashing = false;
        }

        if (network) {
            network->broadcast(json({
                {"event", "playerMoved"},
                {"tick", worldTick},
                {"id", playerId},
                {"x", player.x},
                {"y", player.y},
                {"direction", player.direction},
                {"animRow", player.animRow},
                {"isDashing", player.isDashing}
            }).dump());
        }
    }
}
