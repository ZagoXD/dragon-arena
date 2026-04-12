#ifndef NETWORK_HANDLER_H
#define NETWORK_HANDLER_H

#include <App.h>
#include <deque>
#include <memory>
#include <nlohmann/json.hpp>
#include <optional>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include "auth/AuthService.h"
#include "auth/SessionService.h"
#include "database/Database.h"
#include "database/UserRepository.h"
#include "GameWorld.h"
#include "moderation/ModerationRepository.h"
#include "moderation/ReportRepository.h"
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
    std::string sessionToken;
    std::string role = "player";
    long long lastWhisperFromUserId = 0;
    std::string lastWhisperFromDisplay;
    std::string currentInstanceKey;
    std::string currentArenaMode;
    std::string currentMatchId;
    bool authenticated = false;
};

struct MatchQueueEntry {
    long long userId = 0;
    std::string nickname;
    std::string tag;
    std::string role = "player";
    std::string characterId;
    long long queuedAtMs = 0;
};

struct PendingMatchInvitation {
    std::string matchId;
    std::vector<long long> userIds;
    std::unordered_map<long long, std::string> characterIds;
    std::unordered_map<long long, std::string> nicknames;
    std::unordered_map<long long, std::string> tags;
    std::unordered_map<long long, bool> acceptedByUserId;
    long long createdAtMs = 0;
    long long acceptDeadlineMs = 0;
};

struct ActiveMatchInstance {
    std::string matchId;
    std::string instanceKey;
    std::unordered_map<long long, std::string> characterIds;
    std::unordered_map<long long, std::string> playerSocketIds;
    long long createdAtMs = 0;
    long long startedAtMs = 0;
    long long endsAtMs = 0;
    bool finished = false;
};

struct ArenaInstance {
    std::string key;
    std::string mode;
    std::unique_ptr<GameWorld> world;
    std::unordered_set<std::string> playerIds;
    std::unordered_set<long long> userIds;
    std::optional<std::string> matchId;
};

class NetworkHandler {
public:
    GameWorld &world;
private:
    int port;
    Database& database;
    UserRepository userRepository;
    ModerationRepository moderationRepository;
    ReportRepository reportRepository;
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
    std::unordered_map<std::string, ArenaInstance> arenaInstances;
    std::unordered_map<std::string, std::string> playerInstanceBySocketId;
    std::unordered_map<long long, std::string> trainingInstanceByUserId;
    std::unordered_map<long long, MatchQueueEntry> queuedPlayersByUserId;
    std::deque<long long> matchmakingQueue;
    std::unordered_map<std::string, PendingMatchInvitation> pendingMatches;
    std::unordered_map<long long, std::string> pendingMatchByUserId;
    std::unordered_map<std::string, ActiveMatchInstance> activeMatches;
    std::unordered_map<long long, std::string> activeMatchByUserId;
    std::unordered_map<long long, std::string> readyMatchByUserId;
    std::mutex arena_mtx;
    std::string broadcastContextInstanceKey;

public:
    NetworkHandler(GameWorld &world, int port, Database& database);
    void start();
    std::string pushBroadcastContext(const std::string& instanceKey);
    void popBroadcastContext(const std::string& previousInstanceKey);
    void broadcastToInstance(const std::string& instanceKey, const std::string& message);
    void sendToUser(long long userId, const std::string& message);

private:
    void handleMessage(uWS::WebSocket<false, true, PerSocketData> *ws, std::string_view message);
    void handleClose(uWS::WebSocket<false, true, PerSocketData> *ws);
    void updateArenaInstances();
    void updatePendingMatches();
    void updateRunningMatches();
    bool joinArenaInstance(
        uWS::WebSocket<false, true, PerSocketData>* ws,
        PerSocketData* userData,
        const std::string& characterId,
        const std::string& mode,
        const std::string& matchId
    );
    void removeFromArenaInstance(uWS::WebSocket<false, true, PerSocketData>* ws, PerSocketData* userData);
    void enqueuePlayerForMatch(const MatchQueueEntry& entry);
    void tryCreatePendingMatch();
    void sendMatchFound(const PendingMatchInvitation& invitation);
    void cancelPendingMatch(const std::string& matchId, const std::string& reason, long long actorUserId = 0);
    void createActiveMatchFromInvitation(const PendingMatchInvitation& invitation);
    void finishMatch(const std::string& matchId, const std::string& reason, long long disconnectedUserId = 0);
    json buildMatchEndedPayload(
        const ActiveMatchInstance& match,
        long long userId,
        const std::string& reason,
        long long disconnectedUserId = 0
    );
    json buildMatchSummaryPayload(
        const ActiveMatchInstance& match,
        long long userId
    );
    void registerAuthenticatedSocket(uWS::WebSocket<false, true, PerSocketData>* ws, PerSocketData* userData);
    void unregisterAuthenticatedSocket(uWS::WebSocket<false, true, PerSocketData>* ws, const PerSocketData* userData);
    bool isUserOnline(long long userId);
    json buildFriendsSyncPayload(long long userId, std::string* error = nullptr);
    json buildPrivateChatsSyncPayload(long long userId, std::string* error = nullptr);
    json buildAdminUserLookupPayload(long long requesterUserId, const std::string& nickname, const std::string& tag, std::string* error = nullptr);
    json buildAdminReportsSyncPayload(std::string* error = nullptr);
    void sendFriendsSyncToSocket(uWS::WebSocket<false, true, PerSocketData>* ws, long long userId);
    void sendFriendsSyncToUser(long long userId);
    void sendFriendsSyncToUsers(const std::vector<long long>& userIds);
    void sendPrivateChatsSyncToSocket(uWS::WebSocket<false, true, PerSocketData>* ws, long long userId);
    void sendPrivateChatsSyncToUser(long long userId);
    void sendPrivateChatsSyncToUsers(const std::vector<long long>& userIds);
    void sendAdminReportsSyncToUser(long long userId);
    void notifyFriendsPresenceChanged(long long userId);
    void sendArenaPublicMessage(const json& payload);
    void sendPrivateMessageToUser(long long userId, const json& payload, bool alsoSendArenaWhisper = false);
    void disconnectUserSessions(
        long long userId,
        const json& payload,
        uWS::WebSocket<false, true, PerSocketData>* excludedSocket = nullptr,
        const std::string* allowedSessionToken = nullptr,
        bool invalidateStoredSessions = true
    );
public:
    void broadcast(const std::string &message);
    void sendTo(const std::string &id, const std::string &message);
};

#endif
