#include "NetworkHandler.h"
#include <iostream>

NetworkHandler::NetworkHandler(GameWorld &world, int port) : world(world), port(port) {}

void NetworkHandler::start() {
    uWS::App().ws<PerSocketData>("/*", {
        .compression = uWS::SHARED_COMPRESSOR,
        .open = [](auto *ws) {
            std::cout << "Nova conexao via NetworkHandler." << std::endl;
        },
        .message = [this](auto *ws, std::string_view message, uWS::OpCode opCode) {
            this->handleMessage(ws, message);
        },
        .close = [this](auto *ws, int code, std::string_view message) {
            this->handleClose(ws);
        }
    }).listen(port, [this](us_listen_socket_t *listen_socket) {
        if (listen_socket) {
            std::cout << "Servidor Dragon Arena (Modular) rodando na porta " << port << std::endl;
            
            // Iniciar loop de update do mundo (Respawn de Dummies, etc)
            // Usamos o loop principal do uWS
            struct us_loop_t *loop = (struct us_loop_t *) uWS::Loop::get();
            struct us_timer_t *timer = us_create_timer(loop, 0, sizeof(NetworkHandler *));
            
            *(NetworkHandler **) us_timer_ext(timer) = this;

            us_timer_set(timer, [](struct us_timer_t *t) {
                NetworkHandler *nh = *(NetworkHandler **) us_timer_ext(t);
                nh->world.update(nh);
            }, 1000, 1000);
        }
    }).run();
}

void NetworkHandler::broadcast(const std::string &message) {
    std::lock_guard<std::mutex> lock(clients_mtx);
    for (auto const& [id, ws] : clients) {
        ws->send(message, uWS::OpCode::TEXT);
    }
}

void NetworkHandler::sendTo(const std::string &id, const std::string &message) {
    std::lock_guard<std::mutex> lock(clients_mtx);
    if (clients.count(id)) {
        clients[id]->send(message, uWS::OpCode::TEXT);
    }
}

void NetworkHandler::handleMessage(uWS::WebSocket<false, true, PerSocketData> *ws, std::string_view message) {
    try {
        auto data = json::parse(message);
        std::string event = data["event"];
        PerSocketData *userData = ws->getUserData();
        
        if (event == "join") {
            std::string id = std::to_string(reinterpret_cast<uintptr_t>(ws));
            userData->id = id;
            {
                std::lock_guard<std::mutex> lock(clients_mtx);
                clients[id] = ws;
            }

            int maxHp = data.contains("maxHp") ? (int)data["maxHp"] : 500;
            world.addPlayer(id, data["name"], data["characterId"], maxHp);

            // Welcome message to tell user THEIR id
            ws->send(json({{"event", "welcome"}, {"id", id}}).dump(), uWS::OpCode::TEXT);

            ws->send(json({{"event", "currentPlayers"}, {"players", world.getPlayersJson()}}).dump(), uWS::OpCode::TEXT);
            ws->send(json({{"event", "currentDummies"}, {"dummies", world.getDummiesJson()}}).dump(), uWS::OpCode::TEXT);
            
            std::string joinMsg = json({{"event", "playerJoined"}, {"player", world.getPlayerJson(id)}}).dump();
            broadcast(joinMsg);
            ws->subscribe("arena");
        } 
        else if (event == "move") {
            if (world.movePlayer(userData->id, data["x"], data["y"], data["direction"], data["animRow"])) {
                ws->publish("arena", json({
                    {"event", "playerMoved"}, {"id", userData->id},
                    {"x", data["x"]}, {"y", data["y"]},
                    {"direction", data["direction"]}, {"animRow", data["animRow"]}
                }).dump(), uWS::OpCode::TEXT);
            }
        }
        else if (event == "shoot") {
            ws->publish("arena", json({
                {"event", "playerShot"}, {"playerId", userData->id},
                {"originX", data["originX"]}, {"originY", data["originY"]},
                {"angle", data["angle"]}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "dummyDamage") {
            int newHp = world.hitDummy(data["dummyId"], data["damage"]);
            if (newHp >= 0) {
                broadcast(json({{"event", "dummyDamaged"}, {"id", data["dummyId"]}, {"hp", newHp}}).dump());
            }
        }
        else if (event == "takeDamage") {
            int newHp = world.takeDamage(userData->id, data["amount"]);
            if (newHp >= 0) {
                broadcast(json({{"event", "playerDamaged"}, {"id", userData->id}, {"hp", newHp}}).dump());
            }
        }
        else if (event == "hitPlayer") {
            auto res = world.hitPlayer(data["targetId"], userData->id, data["damage"]);
            if (res.hit) {
                std::cout << "[WS] Player " << data["targetId"] << " colpito da " << userData->id << " HP: " << res.newHp << std::endl;
                broadcast(json({{"event", "playerDamaged"}, {"id", data["targetId"]}, {"hp", res.newHp}}).dump());

                if (res.killed) {
                    broadcast(json({
                        {"event", "playerScored"}, {"victimId", data["targetId"]}, {"attackerId", userData->id},
                        {"targetDeaths", res.victimDeaths}, {"attackerKills", res.attackerKills}
                    }).dump());
                }
            }
        }
        else if (event == "respawn") {
            world.respawnPlayer(userData->id);
            json p = world.getPlayerJson(userData->id);
            broadcast(json({{"event", "playerRespawned"}, {"id", userData->id}, {"hp", p["hp"]}, {"x", p["x"]}, {"y", p["y"]}}).dump());
        }
    } catch (const std::exception &e) {
        std::cerr << "[WS] Errore parsing JSON: " << e.what() << " Messaggio: " << message << std::endl;
    } catch (...) {
        std::cerr << "[WS] Errore sconosciuto nel processing del messaggio" << std::endl;
    }
}

void NetworkHandler::handleClose(uWS::WebSocket<false, true, PerSocketData> *ws) {
    PerSocketData *userData = ws->getUserData();
    if (!userData->id.empty()) {
        std::string id = userData->id;
        
        {
            std::lock_guard<std::mutex> lock(clients_mtx);
            clients.erase(id);
        }

        world.removePlayer(id);
        broadcast(json({{"event", "playerLeft"}, {"id", id}}).dump());
    }
}
