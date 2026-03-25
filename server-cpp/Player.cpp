#include "Player.h"

Player::Player(std::string id, std::string name, std::string charId, int maxHp)
    : id(id), name(name), characterId(charId), hp(maxHp), maxHp(maxHp), 
      x(2048.0f), y(1280.0f), direction("down"), animRow(0), kills(0), deaths(0) {}

json Player::to_json() const {
    return {
        {"id", id}, {"name", name}, {"characterId", characterId},
        {"x", x}, {"y", y}, {"direction", direction},
        {"animRow", animRow}, {"hp", hp}, {"maxHp", maxHp},
        {"kills", kills}, {"deaths", deaths}
    };
}

void Player::update_position(float nx, float ny, std::string dir, int anim) {
    x = nx;
    y = ny;
    direction = dir;
    animRow = anim;
}

bool Player::take_damage(int amount) {
    hp -= amount;
    if (hp <= 0) {
        hp = 0;
        return true; // Morreu
    }
    return false;
}

void Player::respawn(float startX, float startY) {
    hp = maxHp;
    x = startX;
    y = startY;
}
