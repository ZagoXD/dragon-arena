#include "../NetworkHandler.h"

NetworkHandler::NetworkHandler(GameWorld& world, int port) : world(world), port(port) {}

void NetworkHandler::start() {}

void NetworkHandler::broadcast(const std::string& message) {
    (void)message;
}

void NetworkHandler::sendTo(const std::string& id, const std::string& message) {
    (void)id;
    (void)message;
}
