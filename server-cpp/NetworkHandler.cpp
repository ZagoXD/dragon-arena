#include "NetworkHandler.h"
#include "ProtocolConfig.h"
#include "ProtocolPayloadBuilder.h"
#include "ServerDiagnostics.h"
#include <iostream>

namespace {
bool hasString(const json& payload, const char* key) {
    return payload.contains(key) && payload[key].is_string();
}

bool hasNumber(const json& payload, const char* key) {
    return payload.contains(key) && payload[key].is_number();
}
}

NetworkHandler::NetworkHandler(GameWorld &world, int port, Database& database)
    : world(world),
      port(port),
      database(database),
      userRepository(database),
      authService(userRepository),
      sessionService(userRepository) {}

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
            
            struct us_loop_t *loop = (struct us_loop_t *) uWS::Loop::get();
            struct us_timer_t *timer = us_create_timer(loop, 0, sizeof(NetworkHandler *));
            
            *(NetworkHandler **) us_timer_ext(timer) = this;

            us_timer_set(timer, [](struct us_timer_t *t) {
                NetworkHandler *nh = *(NetworkHandler **) us_timer_ext(t);
                nh->world.update(nh);
            }, DRAGON_ARENA_TICK_INTERVAL_MS, DRAGON_ARENA_TICK_INTERVAL_MS);
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
        if (!hasString(data, "event")) {
            ws->send(ProtocolPayloadBuilder::buildProtocolError("missing_event", "Payload must include a string event field").dump(), uWS::OpCode::TEXT);
            return;
        }

        std::string event = data["event"];
        PerSocketData *userData = ws->getUserData();
        ServerDiagnostics::logProtocolEvent("clientMessage", {
            {"event", event},
            {"hasSession", userData != nullptr && !userData->id.empty()}
        });
        
        if (event == "register") {
            if (!hasString(data, "email") || !hasString(data, "username") || !hasString(data, "nickname") || !hasString(data, "password")) {
                ws->send(ProtocolPayloadBuilder::buildAuthError("invalid_payload", "register requires string email, username, nickname and password").dump(), uWS::OpCode::TEXT);
                return;
            }

            AuthResult auth = authService.registerUser(data["email"], data["username"], data["nickname"], data["password"]);
            if (!auth.ok || !auth.authenticatedUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(auth.code, auth.message).dump(), uWS::OpCode::TEXT);
                return;
            }

            SessionAuthResult session = sessionService.createSession(*auth.authenticatedUser);
            if (!session.ok || !session.authenticatedSession.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(session.code, session.message).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->authenticated = true;
            userData->userId = session.authenticatedSession->authenticatedUser.user.id;
            userData->email = session.authenticatedSession->authenticatedUser.user.email;
            userData->username = session.authenticatedSession->authenticatedUser.user.username;
            userData->nickname = session.authenticatedSession->authenticatedUser.user.nickname;
            userData->role = session.authenticatedSession->authenticatedUser.user.role;
            ws->send(ProtocolPayloadBuilder::buildAuthSuccess(
                "register",
                session.authenticatedSession->authenticatedUser,
                session.authenticatedSession->session.token,
                session.authenticatedSession->session.expiresAtMs
            ).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "login") {
            if (!hasString(data, "identifier") || !hasString(data, "password")) {
                ws->send(ProtocolPayloadBuilder::buildAuthError("invalid_payload", "login requires string identifier and password").dump(), uWS::OpCode::TEXT);
                return;
            }

            AuthResult auth = authService.loginUser(data["identifier"], data["password"]);
            if (!auth.ok || !auth.authenticatedUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(auth.code, auth.message).dump(), uWS::OpCode::TEXT);
                return;
            }

            SessionAuthResult session = sessionService.createSession(*auth.authenticatedUser);
            if (!session.ok || !session.authenticatedSession.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(session.code, session.message).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->authenticated = true;
            userData->userId = session.authenticatedSession->authenticatedUser.user.id;
            userData->email = session.authenticatedSession->authenticatedUser.user.email;
            userData->username = session.authenticatedSession->authenticatedUser.user.username;
            userData->nickname = session.authenticatedSession->authenticatedUser.user.nickname;
            userData->role = session.authenticatedSession->authenticatedUser.user.role;
            ws->send(ProtocolPayloadBuilder::buildAuthSuccess(
                "login",
                session.authenticatedSession->authenticatedUser,
                session.authenticatedSession->session.token,
                session.authenticatedSession->session.expiresAtMs
            ).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "authToken") {
            if (!hasString(data, "token")) {
                ws->send(ProtocolPayloadBuilder::buildAuthError("invalid_payload", "authToken requires string token").dump(), uWS::OpCode::TEXT);
                return;
            }

            SessionAuthResult session = sessionService.authenticateToken(data["token"]);
            if (!session.ok || !session.authenticatedSession.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(session.code, session.message).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->authenticated = true;
            userData->userId = session.authenticatedSession->authenticatedUser.user.id;
            userData->email = session.authenticatedSession->authenticatedUser.user.email;
            userData->username = session.authenticatedSession->authenticatedUser.user.username;
            userData->nickname = session.authenticatedSession->authenticatedUser.user.nickname;
            userData->role = session.authenticatedSession->authenticatedUser.user.role;
            ws->send(ProtocolPayloadBuilder::buildAuthSuccess(
                "session",
                session.authenticatedSession->authenticatedUser,
                session.authenticatedSession->session.token,
                session.authenticatedSession->session.expiresAtMs
            ).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "profileSync") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("profileSync", "not_authenticated", "Client must authenticate before syncing profile", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            std::optional<UserRecord> user = userRepository.findById(userData->userId, &repositoryError);
            if (!user.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "profileSync",
                    "user_not_found",
                    repositoryError.empty() ? "Authenticated user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            repositoryError.clear();
            std::optional<PlayerProfileRecord> profile = userRepository.findProfileByUserId(userData->userId, &repositoryError);
            if (!profile.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "profileSync",
                    "profile_not_found",
                    repositoryError.empty() ? "Player profile was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->email = user->email;
            userData->username = user->username;
            userData->nickname = user->nickname;
            userData->role = user->role;

            ws->send(ProtocolPayloadBuilder::buildProfileSync(AuthenticatedUser{*user, *profile}).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "join") {
            if (!userData->authenticated) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("join", "not_authenticated", "Client must authenticate before joining the arena", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "characterId")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("join", "invalid_payload", "join requires string characterId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("join", "already_joined", "Client is already joined in the arena", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string id = std::to_string(reinterpret_cast<uintptr_t>(ws));
            userData->id = id;
            {
                std::lock_guard<std::mutex> lock(clients_mtx);
                clients[id] = ws;
            }

            world.addPlayer(
                id,
                userData->nickname.empty() ? userData->username : userData->nickname,
                data["characterId"],
                userData->role
            );
            ws->send(world.getSessionInitJson(id).dump(), uWS::OpCode::TEXT);
            
            std::string joinMsg = json({{"event", "playerJoined"}, {"player", world.getPlayerJson(id)}}).dump();
            broadcast(joinMsg);
            ws->subscribe("arena");
        } 
        else if (event == "move") {
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "not_joined", "Client must join before sending move", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasNumber(data, "inputX") || !hasNumber(data, "inputY") || !hasString(data, "direction") || !data.contains("animRow") || !data["animRow"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "invalid_payload", "move requires numeric inputX/inputY, string direction and integer animRow", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!world.movePlayer(userData->id, data["inputX"], data["inputY"], data["direction"], data["animRow"])) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "move_rejected", "Move intent was not accepted for the current player state", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
            }
        }
        else if (event == "shoot") {
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("shoot", "not_joined", "Client must join before shooting", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasNumber(data, "targetX") || !hasNumber(data, "targetY")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("shoot", "invalid_payload", "shoot requires numeric targetX and targetY", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!world.requestAutoAttack(userData->id, data["targetX"], data["targetY"], this)) {
                sendTo(userData->id, json({
                    {"event", "autoAttackRejected"},
                    {"code", "cooldown_or_state"},
                    {"reason", "Auto attack was rejected due to cooldown or player state"},
                    {"tick", world.getCurrentTick()}
                }).dump());
            }
        }
        else if (event == "respawn") {
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respawn", "not_joined", "Client must join before respawning", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (world.respawnPlayer(userData->id)) {
                json p = world.getPlayerJson(userData->id);
                broadcast(json({{"event", "playerRespawned"}, {"tick", world.getCurrentTick()}, {"id", userData->id}, {"hp", p["hp"]}, {"x", p["x"]}, {"y", p["y"]}}).dump());
            } else {
                sendTo(userData->id, ProtocolPayloadBuilder::buildActionRejected("respawn", "respawn_locked", "Player cannot respawn yet", world.getCurrentTick()).dump());
            }
        }
        else if (event == "useSkill") {
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("useSkill", "not_joined", "Client must join before using skills", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "skillId") || !hasNumber(data, "x") || !hasNumber(data, "y")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("useSkill", "invalid_payload", "useSkill requires string skillId and numeric x/y", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!world.useSkill(userData->id, data["skillId"], data["x"], data["y"], this)) {
                sendTo(userData->id, json({
                    {"event", "skillRejected"},
                    {"skillId", data["skillId"]},
                    {"code", "cooldown_or_state"},
                    {"reason", "Skill request was rejected due to cooldown, invalid skill or player state"},
                    {"tick", world.getCurrentTick()}
                }).dump());
            }
        } else {
            ws->send(ProtocolPayloadBuilder::buildProtocolError("unknown_event", "Unknown event '" + event + "'").dump(), uWS::OpCode::TEXT);
        }
    } catch (const std::exception &e) {
        std::cerr << "[WS] Errore parsing JSON: " << e.what() << " Messaggio: " << message << std::endl;
        ws->send(ProtocolPayloadBuilder::buildProtocolError("invalid_json", e.what()).dump(), uWS::OpCode::TEXT);
    } catch (...) {
        std::cerr << "[WS] Errore sconosciuto nel processing do messaggio" << std::endl;
        ws->send(ProtocolPayloadBuilder::buildProtocolError("unknown_error", "Unknown message processing error").dump(), uWS::OpCode::TEXT);
    }
}

void NetworkHandler::handleClose(uWS::WebSocket<false, true, PerSocketData> *ws) {
    PerSocketData *userData = ws->getUserData();
    if (userData && !userData->id.empty()) {
        std::string id = userData->id;
        {
            std::lock_guard<std::mutex> lock(clients_mtx);
            clients.erase(id);
        }
        world.removePlayer(id);
        broadcast(json({{"event", "playerLeft"}, {"id", id}}).dump());
    }
}
