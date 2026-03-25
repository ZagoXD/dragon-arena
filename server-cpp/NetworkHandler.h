#ifndef NETWORK_HANDLER_H
#define NETWORK_HANDLER_H

#include <App.h>
#include <nlohmann/json.hpp>
#include <string>
#include "GameWorld.h"

using json = nlohmann::json;

struct PerSocketData {
    std::string id;
};

class NetworkHandler {
public:
    GameWorld &world;
private:
    int port;
    std::map<std::string, uWS::WebSocket<false, true, PerSocketData>*> clients;
    std::mutex clients_mtx;

public:
    NetworkHandler(GameWorld &world, int port);
    void start();

private:
    void handleMessage(uWS::WebSocket<false, true, PerSocketData> *ws, std::string_view message);
    void handleClose(uWS::WebSocket<false, true, PerSocketData> *ws);
public:
    void broadcast(const std::string &message);
    void sendTo(const std::string &id, const std::string &message);
};

#endif
