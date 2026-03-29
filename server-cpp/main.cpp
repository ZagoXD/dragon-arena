#include "GameWorld.h"
#include "GameConfig.h"
#include "NetworkHandler.h"
#include "ServerDiagnostics.h"
#include <iostream>

int main() {
    GameConfig::validateDefinitions();
    GameWorld world;
    std::cout << "[Startup]\n" << ServerDiagnostics::buildStartupSummaryText(world) << std::endl;
    NetworkHandler network(world, 3001);
    
    network.start();

    return 0;
}
