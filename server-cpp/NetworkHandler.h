#ifndef NETWORK_HANDLER_H
#define NETWORK_HANDLER_H

#include <App.h>
#include <nlohmann/json.hpp>
#include <string>
#include "auth/AuthService.h"
#include "auth/SessionService.h"
#include "database/Database.h"
#include "database/UserRepository.h"
#include "GameWorld.h"

using json = nlohmann::json;

struct PerSocketData {
    std::string id;
    long long userId = 0;
    std::string email;
    std::string username;
    std::string nickname;
    bool authenticated = false;
};

class NetworkHandler {
public:
    GameWorld &world;
private:
    int port;
    Database& database;
    UserRepository userRepository;
    AuthService authService;
    SessionService sessionService;
    std::map<std::string, uWS::WebSocket<false, true, PerSocketData>*> clients;
    std::mutex clients_mtx;

public:
    NetworkHandler(GameWorld &world, int port, Database& database);
    void start();

private:
    void handleMessage(uWS::WebSocket<false, true, PerSocketData> *ws, std::string_view message);
    void handleClose(uWS::WebSocket<false, true, PerSocketData> *ws);
public:
    void broadcast(const std::string &message);
    void sendTo(const std::string &id, const std::string &message);
};

#endif
