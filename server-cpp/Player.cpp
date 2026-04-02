#include "Player.h"
#include <chrono>

Player::Player(std::string id, std::string name, const CharacterDefinition& definition, std::string role)
    : id(id), name(name), characterId(definition.id), hp(definition.maxHp), maxHp(definition.maxHp),
      x(2048.0f), y(1280.0f), direction("down"), animRow(0), kills(0), deaths(0),
      baseMovementSpeed(definition.movementSpeed), movementSpeed(definition.movementSpeed), colliderWidth(definition.colliderWidth),
      colliderHeight(definition.colliderHeight), autoAttackSpellId(definition.autoAttackSpellId),
      skillIds(definition.skillIds), passiveId(definition.passiveId), isDashing(false) {
    this->role = std::move(role);
}

json Player::to_json() const {
    return {
        {"id", id}, {"name", name}, {"characterId", characterId},
        {"role", role},
        {"x", x}, {"y", y}, {"direction", direction},
        {"animRow", animRow}, {"hp", hp}, {"maxHp", maxHp},
        {"shieldHp", shieldHp}, {"shieldMaxHp", shieldMaxHp}, {"shieldEndTimeMs", shieldEndTimeMs},
        {"kills", kills}, {"deaths", deaths},
        {"movementSpeed", movementSpeed},
        {"immobilizedUntilMs", immobilizedUntilMs},
        {"colliderWidth", colliderWidth},
        {"colliderHeight", colliderHeight},
        {"autoAttackSpellId", autoAttackSpellId},
        {"skillIds", skillIds},
        {"passiveId", passiveId}
    };
}

void Player::update_position(float nx, float ny, std::string dir, int anim) {
    x = nx;
    y = ny;
    direction = dir;
    animRow = anim;
}

bool Player::take_damage(int amount, long long nowMs) {
    if (nowMs < 0) {
        auto now = std::chrono::steady_clock::now();
        nowMs = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    }

    clearExpiredShield(nowMs);

    int remainingDamage = amount;
    if (shieldHp > 0) {
        const int absorbed = std::min(shieldHp, remainingDamage);
        shieldHp -= absorbed;
        remainingDamage -= absorbed;
        if (shieldHp <= 0) {
            shieldHp = 0;
            shieldMaxHp = 0;
            shieldEndTimeMs = 0;
        }
    }

    hp -= remainingDamage;
    if (hp <= 0) {
        hp = 0;
        deathTimeMs = nowMs;
        shieldHp = 0;
        shieldMaxHp = 0;
        shieldEndTimeMs = 0;
        return true;
    }
    return false;
}

void Player::grantShield(int amount, long long durationMs, long long nowMs) {
    clearExpiredShield(nowMs);
    shieldHp = amount;
    shieldMaxHp = amount;
    shieldEndTimeMs = nowMs + durationMs;
}

void Player::clearExpiredShield(long long nowMs) {
    if (shieldHp > 0 && shieldEndTimeMs > 0 && nowMs >= shieldEndTimeMs) {
        shieldHp = 0;
        shieldMaxHp = 0;
        shieldEndTimeMs = 0;
    }
}

void Player::respawn(float startX, float startY) {
    hp = maxHp;
    shieldHp = 0;
    shieldMaxHp = 0;
    x = startX;
    y = startY;
    deathTimeMs = 0;
    immobilizedUntilMs = 0;
    shieldEndTimeMs = 0;
}

bool Player::canRespawn(long long nowMs, int respawnDelayMs) const {
    if (hp > 0) {
        return false;
    }

    if (deathTimeMs <= 0) {
        return true;
    }

    return nowMs - deathTimeMs >= respawnDelayMs;
}
