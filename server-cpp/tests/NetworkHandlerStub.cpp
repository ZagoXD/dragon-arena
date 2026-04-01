#include "../NetworkHandler.h"

NetworkHandler::NetworkHandler(GameWorld& world, int port, Database& database)
    : world(world),
      port(port),
      database(database),
      userRepository(database),
      friendshipRepository(database),
      privateChatRepository(database),
      arenaChatRepository(database),
      authService(userRepository),
      sessionService(userRepository) {}

void NetworkHandler::start() {}

void NetworkHandler::broadcast(const std::string& message) {
    (void)message;
}

void NetworkHandler::sendTo(const std::string& id, const std::string& message) {
    (void)id;
    (void)message;
}
