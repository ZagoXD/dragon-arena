#include "GameWorld.h"
#include "NetworkHandler.h"

int main() {
    GameWorld world;
    NetworkHandler network(world, 3001);
    
    network.start();

    return 0;
}
