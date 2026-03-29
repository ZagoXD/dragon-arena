#include "DashSystem.h"
#include "CombatSystem.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <algorithm>
#include <cmath>

void DashSystem::updateDashes(
    std::map<std::string, Player>& players,
    std::map<std::string, DummyEntity>& dummies,
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
                PlayerDamageResult damageResult = CombatSystem::applyAttackToPlayer(target, &player, dashSpell.damage, false);
                player.dashHitIds.push_back(otherId);
                ServerDiagnostics::logCombatEvent("dashHitPlayer", {
                    {"tick", worldTick},
                    {"playerId", playerId},
                    {"targetId", otherId},
                    {"damage", dashSpell.damage},
                    {"killed", damageResult.killed}
                });

                if (network) {
                    network->broadcast(json({
                        {"event", "playerDamaged"},
                        {"tick", worldTick},
                        {"id", otherId},
                        {"hp", damageResult.newHp}
                    }).dump());
                }
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
                DummyDamageResult damageResult = CombatSystem::applyDamageToDummy(dummy, dashSpell.damage, nowMs);
                player.dashHitIds.push_back(dummyId);
                ServerDiagnostics::logCombatEvent("dashHitDummy", {
                    {"tick", worldTick},
                    {"playerId", playerId},
                    {"dummyId", dummyId},
                    {"damage", dashSpell.damage},
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
