#include "SkillSystem.h"
#include "GameConfig.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <chrono>
#include <cmath>
#include <sstream>

namespace {
std::string makeProjectileId(const std::string& ownerId, long long nowMs) {
    static long long sequence = 0;
    std::ostringstream id;
    id << "proj_" << ownerId << "_" << nowMs << "_" << sequence++;
    return id.str();
}
}

bool SkillSystem::requestAutoAttack(
    std::map<std::string, Player>& players,
    std::vector<PendingAutoAttack>& pendingAutoAttacks,
    unsigned long long worldTick,
    const std::string& playerId,
    float targetX,
    float targetY,
    NetworkHandler* network
) {
    if (!players.count(playerId)) {
        return false;
    }

    Player& player = players[playerId];
    if (player.hp <= 0 || player.isDashing) {
        return false;
    }

    const auto& spell = GameConfig::getSpellDefinition(player.autoAttackSpellId);
    auto now = std::chrono::steady_clock::now();
    long long nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    long long lastUse = player.lastSkillUseTimes.count(player.autoAttackSpellId)
        ? player.lastSkillUseTimes[player.autoAttackSpellId]
        : 0;

    if (nowMs - lastUse < spell.cooldownMs) {
        return false;
    }

    for (const auto& cast : pendingAutoAttacks) {
        if (cast.playerId == playerId && cast.spellId == player.autoAttackSpellId) {
            return false;
        }
    }

    float originX = player.x + player.colliderWidth / 2.0f;
    float originY = player.y + player.colliderHeight / 2.0f;
    float angle = std::atan2(targetY - originY, targetX - originX);

    player.lastSkillUseTimes[player.autoAttackSpellId] = nowMs;
    pendingAutoAttacks.push_back({
        playerId,
        player.autoAttackSpellId,
        makeProjectileId(playerId, nowMs),
        originX,
        originY,
        angle,
        nowMs + spell.castTimeMs
    });

    if (network) {
        ServerDiagnostics::logCombatEvent("autoAttackAccepted", {
            {"tick", worldTick},
            {"playerId", playerId},
            {"spellId", player.autoAttackSpellId},
            {"castTimeMs", spell.castTimeMs},
            {"cooldownMs", spell.cooldownMs}
        });
        network->broadcast(json({
            {"event", "autoAttackStarted"},
            {"tick", worldTick},
            {"playerId", playerId},
            {"spellId", player.autoAttackSpellId},
            {"angle", angle},
            {"castTimeMs", spell.castTimeMs},
            {"cooldownMs", spell.cooldownMs}
        }).dump());
    }

    return true;
}

bool SkillSystem::useSkill(
    std::map<std::string, Player>& players,
    unsigned long long worldTick,
    const std::string& playerId,
    const std::string& skillId,
    float targetX,
    float targetY,
    NetworkHandler* network
) {
    if (!players.count(playerId)) return false;
    if (!GameConfig::getSpellDefinitions().count(skillId)) return false;

    Player& player = players[playerId];
    if (player.isDashing || player.hp <= 0) return false;

    const auto& spell = GameConfig::getSpellDefinition(skillId);
    auto now = std::chrono::steady_clock::now();
    long long nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    long long lastUse = player.lastSkillUseTimes.count(skillId) ? player.lastSkillUseTimes[skillId] : 0;

    if (nowMs - lastUse < spell.cooldownMs) {
        return false;
    }

    if (skillId == "dragon_dive") {
        float dx = targetX - player.x;
        float dy = targetY - player.y;
        float dist = std::sqrt(dx * dx + dy * dy);
        if (dist > spell.range && dist > 0.0f) {
            targetX = player.x + (dx / dist) * spell.range;
            targetY = player.y + (dy / dist) * spell.range;
        }

        player.isDashing = true;
        player.dashStartX = player.x;
        player.dashStartY = player.y;
        player.dashTargetX = targetX;
        player.dashTargetY = targetY;
        player.dashStartTime = nowMs;
        player.dashDuration = spell.effectDurationMs;
        player.lastSkillUseTimes[skillId] = nowMs;
        player.dashHitIds.clear();

        if (network) {
            ServerDiagnostics::logCombatEvent("skillAccepted", {
                {"tick", worldTick},
                {"playerId", playerId},
                {"skillId", skillId},
                {"targetX", targetX},
                {"targetY", targetY}
            });
            network->broadcast(json({
                {"event", "skillUsed"},
                {"tick", worldTick},
                {"id", playerId},
                {"skillId", skillId},
                {"targetX", targetX},
                {"targetY", targetY},
                {"castTimeMs", spell.castTimeMs},
                {"cooldownMs", spell.cooldownMs},
                {"effectDurationMs", spell.effectDurationMs}
            }).dump());
        }

        return true;
    }

    return false;
}
