#include "SkillSystem.h"
#include "GameConfig.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <algorithm>
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

void broadcastSkillUsed(
    NetworkHandler* network,
    unsigned long long worldTick,
    const std::string& playerId,
    const std::string& skillId,
    float targetX,
    float targetY,
    float originX,
    float originY,
    float angle,
    const SpellDefinition& spell
) {
    if (!network) {
        return;
    }

    ServerDiagnostics::logCombatEvent("skillAccepted", {
        {"tick", worldTick},
        {"playerId", playerId},
        {"skillId", skillId},
        {"targetX", targetX},
        {"targetY", targetY},
        {"originX", originX},
        {"originY", originY},
        {"angle", angle}
    });
    network->broadcast(json({
        {"event", "skillUsed"},
        {"tick", worldTick},
        {"id", playerId},
        {"skillId", skillId},
        {"targetX", targetX},
        {"targetY", targetY},
        {"originX", originX},
        {"originY", originY},
        {"angle", angle},
        {"castTimeMs", spell.castTimeMs},
        {"cooldownMs", spell.cooldownMs},
        {"effectDurationMs", spell.effectDurationMs}
    }).dump());
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

    auto now = std::chrono::steady_clock::now();
    long long nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    Player& player = players[playerId];
    if (player.hp <= 0 || player.isDashing) {
        return false;
    }
    if (player.immobilizedUntilMs > nowMs) {
        return false;
    }

    const auto& spell = GameConfig::getSpellDefinition(player.autoAttackSpellId);
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
            {"originX", originX},
            {"originY", originY},
            {"angle", angle},
            {"castTimeMs", spell.castTimeMs},
            {"cooldownMs", spell.cooldownMs}
        }).dump());
    }

    return true;
}

bool SkillSystem::useSkill(
    std::map<std::string, Player>& players,
    std::vector<ActiveProjectile>& activeProjectiles,
    std::vector<ActiveAreaEffect>& activeAreaEffects,
    unsigned long long worldTick,
    const std::string& playerId,
    const std::string& skillId,
    float targetX,
    float targetY,
    NetworkHandler* network
) {
    if (!players.count(playerId)) return false;
    if (!GameConfig::getSpellDefinitions().count(skillId)) return false;

    auto now = std::chrono::steady_clock::now();
    long long nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    Player& player = players[playerId];
    if (player.isDashing || player.hp <= 0) return false;
    if (player.immobilizedUntilMs > nowMs) return false;
    if (std::find(player.skillIds.begin(), player.skillIds.end(), skillId) == player.skillIds.end()) return false;

    const auto& spell = GameConfig::getSpellDefinition(skillId);
    long long lastUse = player.lastSkillUseTimes.count(skillId) ? player.lastSkillUseTimes[skillId] : 0;

    if (nowMs - lastUse < spell.cooldownMs) {
        return false;
    }

    float originX = player.x + player.colliderWidth / 2.0f;
    float originY = player.y + player.colliderHeight / 2.0f;
    float angle = std::atan2(targetY - originY, targetX - originX);

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

        broadcastSkillUsed(network, worldTick, playerId, skillId, targetX, targetY, originX, originY, angle, spell);

        return true;
    }

    if (skillId == "flamethrower") {
        activeAreaEffects.push_back({
            "area_" + playerId + "_" + std::to_string(nowMs),
            playerId,
            skillId,
            originX,
            originY,
            angle,
            nowMs + spell.castTimeMs,
            nowMs + spell.castTimeMs + spell.effectDurationMs,
            nowMs + spell.castTimeMs,
            0
        });
        player.lastSkillUseTimes[skillId] = nowMs;

        broadcastSkillUsed(network, worldTick, playerId, skillId, targetX, targetY, originX, originY, angle, spell);

        return true;
    }

    if (skillId == "poison_flash") {
        const float clampedTargetX = originX + std::cos(angle) * spell.range;
        const float clampedTargetY = originY + std::sin(angle) * spell.range;

        activeAreaEffects.push_back({
            "area_" + playerId + "_" + std::to_string(nowMs),
            playerId,
            skillId,
            originX,
            originY,
            angle,
            nowMs,
            nowMs + spell.effectDurationMs,
            nowMs,
            0
        });
        player.lastSkillUseTimes[skillId] = nowMs;

        broadcastSkillUsed(network, worldTick, playerId, skillId, clampedTargetX, clampedTargetY, originX, originY, angle, spell);

        return true;
    }

    if (skillId == "poison_shield") {
        player.grantShield(500, 3000, nowMs);
        player.lastSkillUseTimes[skillId] = nowMs;

        broadcastSkillUsed(network, worldTick, playerId, skillId, originX, originY, originX, originY, 0.0f, spell);

        if (network) {
            network->broadcast(json({
                {"event", "playerShieldChanged"},
                {"tick", worldTick},
                {"id", playerId},
                {"hp", player.hp},
                {"movementSpeed", player.movementSpeed},
                {"shieldHp", player.shieldHp},
                {"shieldMaxHp", player.shieldMaxHp},
                {"shieldEndTimeMs", player.shieldEndTimeMs}
            }).dump());
        }

        return true;
    }

    if (skillId == "fire_blast") {
        const float clampedTargetX = originX + std::cos(angle) * spell.range;
        const float clampedTargetY = originY + std::sin(angle) * spell.range;

        player.lastSkillUseTimes[skillId] = nowMs;
        const std::string projectileId = makeProjectileId(playerId, nowMs);
        activeProjectiles.push_back({
            projectileId,
            playerId,
            skillId,
            originX,
            originY,
            angle,
            0.0f,
            0.0f,
            {},
            {}
        });

        broadcastSkillUsed(network, worldTick, playerId, skillId, clampedTargetX, clampedTargetY, originX, originY, angle, spell);

        if (network) {
            network->broadcast(json({
                {"event", "projectileSpawned"},
                {"tick", worldTick},
                {"projectile", {
                    {"id", projectileId},
                    {"ownerId", playerId},
                    {"spellId", skillId},
                    {"x", originX},
                    {"y", originY},
                    {"angle", angle},
                    {"distance", 0.0f}
                }}
            }).dump());
        }

        return true;
    }

    if (skillId == "seed_bite") {
        const float tileCenterX = static_cast<float>(std::floor(originX / 64.0f) * 64.0f + 32.0f);
        const float tileCenterY = static_cast<float>(std::floor(originY / 64.0f) * 64.0f + 32.0f);

        player.immobilizedUntilMs = std::max(player.immobilizedUntilMs, nowMs + spell.effectDurationMs);
        activeAreaEffects.push_back({
            "area_" + playerId + "_" + std::to_string(nowMs),
            playerId,
            skillId,
            tileCenterX,
            tileCenterY,
            0.0f,
            nowMs,
            nowMs + spell.effectDurationMs,
            nowMs,
            0
        });
        player.lastSkillUseTimes[skillId] = nowMs;

        broadcastSkillUsed(network, worldTick, playerId, skillId, tileCenterX, tileCenterY, tileCenterX, tileCenterY, 0.0f, spell);

        return true;
    }

    return false;
}
