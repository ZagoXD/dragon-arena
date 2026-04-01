#ifndef NETWORK_HANDLER_H
#define NETWORK_HANDLER_H

#include <App.h>
#include <nlohmann/json.hpp>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include "auth/AuthService.h"
#include "auth/SessionService.h"
#include "database/Database.h"
#include "database/UserRepository.h"
#include "GameWorld.h"
#include "social/ArenaChatRepository.h"
#include "social/FriendshipRepository.h"
#include "social/PrivateChatRepository.h"

using json = nlohmann::json;

struct PerSocketData {
    std::string id;
    long long userId = 0;
    std::string email;
    std::string username;
    std::string nickname;
    std::string tag;
    std::string role = "player";
    long long lastWhisperFromUserId = 0;
    std::string lastWhisperFromDisplay;
    bool authenticated = false;
};

class NetworkHandler {
public:
    GameWorld &world;
private:
    int port;
    Database& database;
    UserRepository userRepository;
    FriendshipRepository friendshipRepository;
    PrivateChatRepository privateChatRepository;
    ArenaChatRepository arenaChatRepository;
    AuthService authService;
    SessionService sessionService;
    std::map<std::string, uWS::WebSocket<false, true, PerSocketData>*> clients;
    std::mutex clients_mtx;
    std::unordered_map<long long, std::unordered_set<uWS::WebSocket<false, true, PerSocketData>*>> authenticatedSockets;
    std::unordered_map<long long, int> onlineUserCounts;
    std::mutex social_mtx;

public:
    NetworkHandler(GameWorld &world, int port, Database& database);
    void start();

private:
    void handleMessage(uWS::WebSocket<false, true, PerSocketData> *ws, std::string_view message);
    void handleClose(uWS::WebSocket<false, true, PerSocketData> *ws);
    void registerAuthenticatedSocket(uWS::WebSocket<false, true, PerSocketData>* ws, PerSocketData* userData);
    void unregisterAuthenticatedSocket(uWS::WebSocket<false, true, PerSocketData>* ws, const PerSocketData* userData);
    bool isUserOnline(long long userId);
    json buildFriendsSyncPayload(long long userId, std::string* error = nullptr);
    json buildPrivateChatsSyncPayload(long long userId, std::string* error = nullptr);
    void sendFriendsSyncToSocket(uWS::WebSocket<false, true, PerSocketData>* ws, long long userId);
    void sendFriendsSyncToUser(long long userId);
    void sendFriendsSyncToUsers(const std::vector<long long>& userIds);
    void sendPrivateChatsSyncToSocket(uWS::WebSocket<false, true, PerSocketData>* ws, long long userId);
    void sendPrivateChatsSyncToUser(long long userId);
    void sendPrivateChatsSyncToUsers(const std::vector<long long>& userIds);
    void notifyFriendsPresenceChanged(long long userId);
    void sendArenaPublicMessage(const json& payload);
    void sendPrivateMessageToUser(long long userId, const json& payload, bool alsoSendArenaWhisper = false);
public:
    void broadcast(const std::string &message);
    void sendTo(const std::string &id, const std::string &message);
};

#endif
