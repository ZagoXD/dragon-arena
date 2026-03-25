#include "MovementSystem.h"

void MovementSystem::handleMove(Player &p, float nx, float ny, std::string dir, int anim) {
    // Futuramente aqui podemos adicionar verificacao de velocidade
    // baseada no GameConfig para evitar SPEED HACKS
    p.update_position(nx, ny, dir, anim);
}
