#include "NetworkHandler.h"
#include "ProtocolConfig.h"
#include "ProtocolPayloadBuilder.h"
#include "ServerDiagnostics.h"
#include <algorithm>
#include <cctype>
#include <chrono>
#include <ctime>
#include <iostream>
#include <set>
#include <unordered_set>

namespace {
bool hasString(const json& payload, const char* key) {
    return payload.contains(key) && payload[key].is_string();
}

bool hasNumber(const json& payload, const char* key) {
    return payload.contains(key) && payload[key].is_number();
}

std::string trimCopy(const std::string& value) {
    auto first = std::find_if_not(value.begin(), value.end(), [](unsigned char ch) {
        return std::isspace(ch) != 0;
    });
    auto last = std::find_if_not(value.rbegin(), value.rend(), [](unsigned char ch) {
        return std::isspace(ch) != 0;
    }).base();

    if (first >= last) {
        return "";
    }

    return std::string(first, last);
}

std::vector<std::string> splitBySpace(const std::string& text) {
    std::vector<std::string> parts;
    std::string current;
    for (char ch : text) {
        if (std::isspace(static_cast<unsigned char>(ch)) != 0) {
            if (!current.empty()) {
                parts.push_back(current);
                current.clear();
            }
            continue;
        }
        current.push_back(ch);
    }

    if (!current.empty()) {
        parts.push_back(current);
    }

    return parts;
}

bool parseNicknameAndTagToken(const std::string& token, std::string* nickname, std::string* tag) {
    std::size_t tagPos = token.rfind('#');
    if (tagPos == std::string::npos || tagPos == 0 || tagPos == token.size() - 1) {
        return false;
    }

    if (nickname != nullptr) {
        *nickname = token.substr(0, tagPos);
    }

    if (tag != nullptr) {
        *tag = token.substr(tagPos);
    }

    return true;
}

constexpr const char* MAIN_ARENA_KEY = "main";
constexpr long long MATCH_ACCEPT_TIMEOUT_MS = 20000;
constexpr long long MATCH_DURATION_MS = 5LL * 60LL * 1000LL;

const std::unordered_set<std::string> kAllowedReportReasons = {
    "cheating",
    "griefing",
    "feeding",
    "toxicity",
    "spam",
    "offensive_name",
    "other"
};

bool isAllowedReportReason(const std::string& reason) {
    return kAllowedReportReasons.find(reason) != kAllowedReportReasons.end();
}

long long getCurrentTimeMs() {
    const auto now = std::chrono::steady_clock::now();
    return std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
}

std::string makeTrainingInstanceKey(long long userId) {
    return "training:" + std::to_string(userId);
}

std::string makeMatchId(long long nowMs) {
    static long long sequence = 0;
    return "match_" + std::to_string(nowMs) + "_" + std::to_string(sequence++);
}

json buildLookupPayloadJson(
    const UserLookupWithProfile& target,
    bool alreadyFriends,
    bool online,
    const std::optional<ActiveBanRecord>& activeBan
) {
    return {
        {"event", "adminUserLookupResult"},
        {"user", {
            {"id", target.user.id},
            {"nickname", target.user.nickname},
            {"tag", target.user.tag},
            {"username", target.user.username},
            {"email", target.user.email},
            {"role", target.user.role},
            {"online", online},
            {"alreadyFriends", alreadyFriends}
        }},
        {"profile", {
            {"userId", target.profile.userId},
            {"level", target.profile.level},
            {"xp", target.profile.xp},
            {"coins", target.profile.coins}
        }},
        {"activeBan", activeBan.has_value()
            ? json{
                {"id", activeBan->id},
                {"reason", activeBan->reason},
                {"isPermanent", activeBan->isPermanent},
                {"createdAtMs", activeBan->createdAtMs},
                {"bannedUntilMs", activeBan->bannedUntilMs},
                {"bannedByDisplay", activeBan->bannedByNickname + activeBan->bannedByTag}
            }
            : json(nullptr)},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };
}
}

NetworkHandler::NetworkHandler(GameWorld &world, int port, Database& database)
    : world(world),
      port(port),
      database(database),
      userRepository(database),
      moderationRepository(database),
      reportRepository(database),
      friendshipRepository(database),
      privateChatRepository(database),
      arenaChatRepository(database),
      authService(userRepository, moderationRepository),
      sessionService(userRepository, moderationRepository) {}

std::string NetworkHandler::pushBroadcastContext(const std::string& instanceKey) {
    std::string previous = broadcastContextInstanceKey;
    broadcastContextInstanceKey = instanceKey;
    return previous;
}

void NetworkHandler::popBroadcastContext(const std::string& previousInstanceKey) {
    broadcastContextInstanceKey = previousInstanceKey;
}

void NetworkHandler::broadcastToInstance(const std::string& instanceKey, const std::string& message) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> clientsLock(clients_mtx);
        for (const auto& [socketId, ws] : clients) {
            (void)socketId;
            PerSocketData* socketData = ws->getUserData();
            if (socketData == nullptr || socketData->currentInstanceKey != instanceKey) {
                continue;
            }
            sockets.push_back(ws);
        }
    }

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        socket->send(message, uWS::OpCode::TEXT);
    }
}

void NetworkHandler::sendToUser(long long userId, const std::string& message) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> lock(social_mtx);
        auto it = authenticatedSockets.find(userId);
        if (it == authenticatedSockets.end()) {
            return;
        }
        sockets.assign(it->second.begin(), it->second.end());
    }

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        socket->send(message, uWS::OpCode::TEXT);
    }
}

void NetworkHandler::enqueuePlayerForMatch(const MatchQueueEntry& entry) {
    std::lock_guard<std::mutex> lock(arena_mtx);
    queuedPlayersByUserId[entry.userId] = entry;
    matchmakingQueue.push_back(entry.userId);
}

void NetworkHandler::sendMatchFound(const PendingMatchInvitation& invitation) {
    if (invitation.userIds.size() != 2) {
        return;
    }

    const long long firstUserId = invitation.userIds[0];
    const long long secondUserId = invitation.userIds[1];

    const json basePayload = {
        {"event", "matchFound"},
        {"matchId", invitation.matchId},
        {"acceptDeadlineMs", invitation.acceptDeadlineMs},
        {"durationMs", MATCH_DURATION_MS},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };

    json firstPayload = basePayload;
    firstPayload["opponent"] = {
        {"userId", secondUserId},
        {"nickname", invitation.nicknames.count(secondUserId) ? invitation.nicknames.at(secondUserId) : ""},
        {"tag", invitation.tags.count(secondUserId) ? invitation.tags.at(secondUserId) : ""},
        {"characterId", invitation.characterIds.count(secondUserId) ? invitation.characterIds.at(secondUserId) : ""}
    };
    sendToUser(firstUserId, firstPayload.dump());

    json secondPayload = basePayload;
    secondPayload["opponent"] = {
        {"userId", firstUserId},
        {"nickname", invitation.nicknames.count(firstUserId) ? invitation.nicknames.at(firstUserId) : ""},
        {"tag", invitation.tags.count(firstUserId) ? invitation.tags.at(firstUserId) : ""},
        {"characterId", invitation.characterIds.count(firstUserId) ? invitation.characterIds.at(firstUserId) : ""}
    };
    sendToUser(secondUserId, secondPayload.dump());
}

void NetworkHandler::tryCreatePendingMatch() {
    std::lock_guard<std::mutex> lock(arena_mtx);

    while (!matchmakingQueue.empty() && !queuedPlayersByUserId.count(matchmakingQueue.front())) {
        matchmakingQueue.pop_front();
    }

    if (matchmakingQueue.size() < 2) {
        return;
    }

    const long long firstUserId = matchmakingQueue.front();
    matchmakingQueue.pop_front();

    while (!matchmakingQueue.empty() && !queuedPlayersByUserId.count(matchmakingQueue.front())) {
        matchmakingQueue.pop_front();
    }

    if (matchmakingQueue.empty()) {
        matchmakingQueue.push_front(firstUserId);
        return;
    }

    const long long secondUserId = matchmakingQueue.front();
    matchmakingQueue.pop_front();

    if (!queuedPlayersByUserId.count(firstUserId) || !queuedPlayersByUserId.count(secondUserId) || firstUserId == secondUserId) {
        return;
    }

    const MatchQueueEntry firstEntry = queuedPlayersByUserId[firstUserId];
    const MatchQueueEntry secondEntry = queuedPlayersByUserId[secondUserId];
    queuedPlayersByUserId.erase(firstUserId);
    queuedPlayersByUserId.erase(secondUserId);

    PendingMatchInvitation invitation;
    invitation.matchId = makeMatchId(getCurrentTimeMs());
    invitation.userIds = {firstUserId, secondUserId};
    invitation.characterIds[firstUserId] = firstEntry.characterId;
    invitation.characterIds[secondUserId] = secondEntry.characterId;
    invitation.nicknames[firstUserId] = firstEntry.nickname;
    invitation.nicknames[secondUserId] = secondEntry.nickname;
    invitation.tags[firstUserId] = firstEntry.tag;
    invitation.tags[secondUserId] = secondEntry.tag;
    invitation.acceptedByUserId[firstUserId] = false;
    invitation.acceptedByUserId[secondUserId] = false;
    invitation.createdAtMs = getCurrentTimeMs();
    invitation.acceptDeadlineMs = invitation.createdAtMs + MATCH_ACCEPT_TIMEOUT_MS;

    pendingMatchByUserId[firstUserId] = invitation.matchId;
    pendingMatchByUserId[secondUserId] = invitation.matchId;
    pendingMatches[invitation.matchId] = invitation;
    sendMatchFound(invitation);
}

void NetworkHandler::cancelPendingMatch(const std::string& matchId, const std::string& reason, long long actorUserId) {
    PendingMatchInvitation invitation;
    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        auto invitationIt = pendingMatches.find(matchId);
        if (invitationIt == pendingMatches.end()) {
            return;
        }
        invitation = invitationIt->second;
        pendingMatches.erase(invitationIt);
        for (long long userId : invitation.userIds) {
            pendingMatchByUserId.erase(userId);
        }
    }

    for (long long userId : invitation.userIds) {
        if (userId == actorUserId && reason == "declined") {
            continue;
        }

        sendToUser(userId, json({
            {"event", "matchCancelled"},
            {"matchId", matchId},
            {"reason", reason},
            {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
        }).dump());
    }
}

void NetworkHandler::createActiveMatchFromInvitation(const PendingMatchInvitation& invitation) {
    ArenaInstance arenaInstance;
    arenaInstance.key = "match:" + invitation.matchId;
    arenaInstance.mode = "match";
    arenaInstance.matchId = invitation.matchId;
    arenaInstance.world = std::make_unique<GameWorld>(arenaInstance.key, arenaInstance.mode);

    ActiveMatchInstance match;
    match.matchId = invitation.matchId;
    match.instanceKey = arenaInstance.key;
    match.characterIds = invitation.characterIds;
    match.createdAtMs = getCurrentTimeMs();
    match.startedAtMs = match.createdAtMs;
    match.endsAtMs = match.startedAtMs + MATCH_DURATION_MS;

    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        arenaInstances[arenaInstance.key] = std::move(arenaInstance);
        activeMatches[match.matchId] = match;
        for (const auto& [userId, characterId] : invitation.characterIds) {
            (void)characterId;
            readyMatchByUserId[userId] = invitation.matchId;
            activeMatchByUserId[userId] = invitation.matchId;
            pendingMatchByUserId.erase(userId);
        }
        pendingMatches.erase(invitation.matchId);
    }

    for (long long userId : invitation.userIds) {
        const long long opponentUserId = userId == invitation.userIds.front()
            ? invitation.userIds.back()
            : invitation.userIds.front();
        json payload = {
            {"event", "matchReady"},
            {"matchId", invitation.matchId},
            {"durationMs", MATCH_DURATION_MS},
            {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION},
            {"opponentUserId", opponentUserId},
            {"characterId", invitation.characterIds.count(userId) ? invitation.characterIds.at(userId) : ""}
        };
        sendToUser(userId, payload.dump());
    }
}

json NetworkHandler::buildMatchSummaryPayload(const ActiveMatchInstance& match, long long userId) {
    auto instanceIt = arenaInstances.find(match.instanceKey);
    if (instanceIt == arenaInstances.end() || !instanceIt->second.world) {
        return json::object();
    }

    std::vector<Player> players = instanceIt->second.world->getPlayersCopy();
    json payload = json::object();
    for (const Player& player : players) {
        if (std::stoll(player.id) == 0) {
            continue;
        }
        payload[player.id] = {
            {"id", player.id},
            {"name", player.name},
            {"kills", player.kills},
            {"deaths", player.deaths}
        };
    }

    (void)userId;
    return payload;
}

json NetworkHandler::buildMatchEndedPayload(
    const ActiveMatchInstance& match,
    long long userId,
    const std::string& reason,
    long long disconnectedUserId
) {
    auto instanceIt = arenaInstances.find(match.instanceKey);
    std::vector<Player> players = instanceIt != arenaInstances.end() && instanceIt->second.world
        ? instanceIt->second.world->getPlayersCopy()
        : std::vector<Player>{};

    const Player* selfPlayer = nullptr;
    const Player* opponentPlayer = nullptr;
    for (const Player& player : players) {
        const auto socketIt = match.playerSocketIds.find(userId);
        if (socketIt != match.playerSocketIds.end() && player.id == socketIt->second) {
            selfPlayer = &player;
            continue;
        }

        if (!match.playerSocketIds.empty()) {
            bool belongsToSomeoneElse = false;
            for (const auto& [otherUserId, socketId] : match.playerSocketIds) {
                if (otherUserId != userId && player.id == socketId) {
                    opponentPlayer = &player;
                    belongsToSomeoneElse = true;
                    break;
                }
            }
            if (belongsToSomeoneElse) {
                continue;
            }
        }
    }

    std::string result = "draw";
    if (reason == "disconnect" && disconnectedUserId > 0) {
        result = disconnectedUserId == userId ? "defeat" : "victory";
    } else if (selfPlayer != nullptr && opponentPlayer != nullptr) {
        if (selfPlayer->kills > opponentPlayer->kills) {
            result = "victory";
        } else if (selfPlayer->kills < opponentPlayer->kills) {
            result = "defeat";
        }
    }

    return {
        {"event", "matchEnded"},
        {"matchId", match.matchId},
        {"result", result},
        {"reason", reason},
        {"durationMs", MATCH_DURATION_MS},
        {"yourKills", selfPlayer != nullptr ? selfPlayer->kills : 0},
        {"yourDeaths", selfPlayer != nullptr ? selfPlayer->deaths : 0},
        {"opponentKills", opponentPlayer != nullptr ? opponentPlayer->kills : 0},
        {"opponentDeaths", opponentPlayer != nullptr ? opponentPlayer->deaths : 0},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };
}

void NetworkHandler::finishMatch(const std::string& matchId, const std::string& reason, long long disconnectedUserId) {
    ActiveMatchInstance match;
    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        auto matchIt = activeMatches.find(matchId);
        if (matchIt == activeMatches.end() || matchIt->second.finished) {
            return;
        }
        matchIt->second.finished = true;
        for (const auto& [userId, socketId] : matchIt->second.playerSocketIds) {
            (void)socketId;
            activeMatchByUserId.erase(userId);
            readyMatchByUserId.erase(userId);
        }
        match = matchIt->second;
    }

    for (const auto& [userId, socketId] : match.playerSocketIds) {
        (void)socketId;
        sendToUser(userId, buildMatchEndedPayload(match, userId, reason, disconnectedUserId).dump());
    }
}

void NetworkHandler::updatePendingMatches() {
    std::vector<std::string> expiredMatchIds;
    std::vector<PendingMatchInvitation> acceptedMatches;
    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        const long long nowMs = getCurrentTimeMs();
        for (const auto& [matchId, invitation] : pendingMatches) {
            bool allAccepted = true;
            for (long long userId : invitation.userIds) {
                if (!invitation.acceptedByUserId.count(userId) || !invitation.acceptedByUserId.at(userId)) {
                    allAccepted = false;
                    break;
                }
            }

            if (allAccepted) {
                acceptedMatches.push_back(invitation);
                continue;
            }

            if (nowMs >= invitation.acceptDeadlineMs) {
                expiredMatchIds.push_back(matchId);
            }
        }
    }

    for (const std::string& matchId : expiredMatchIds) {
        cancelPendingMatch(matchId, "timeout");
    }

    for (const PendingMatchInvitation& invitation : acceptedMatches) {
        createActiveMatchFromInvitation(invitation);
    }
}

void NetworkHandler::updateRunningMatches() {
    std::vector<std::string> matchesToFinish;
    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        const long long nowMs = getCurrentTimeMs();
        for (const auto& [matchId, match] : activeMatches) {
            if (!match.finished && nowMs >= match.endsAtMs) {
                matchesToFinish.push_back(matchId);
            }
        }
    }

    for (const std::string& matchId : matchesToFinish) {
        finishMatch(matchId, "time_limit");
    }
}

void NetworkHandler::updateArenaInstances() {
    std::vector<ArenaInstance*> instances;
    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        for (auto& [instanceKey, instance] : arenaInstances) {
            (void)instanceKey;
            if (!instance.world) {
                continue;
            }

            if (instance.mode == "match") {
                auto matchIdIt = instance.matchId;
                if (matchIdIt.has_value()) {
                    auto activeIt = activeMatches.find(*matchIdIt);
                    if (activeIt != activeMatches.end() && activeIt->second.finished) {
                        continue;
                    }
                }
            }

            instances.push_back(&instance);
        }
    }

    for (ArenaInstance* instance : instances) {
        const std::string previousInstance = pushBroadcastContext(instance->key);
        instance->world->update(this);
        popBroadcastContext(previousInstance);
    }
}

bool NetworkHandler::joinArenaInstance(
    uWS::WebSocket<false, true, PerSocketData>* ws,
    PerSocketData* userData,
    const std::string& characterId,
    const std::string& mode,
    const std::string& matchId
) {
    if (userData == nullptr) {
        return false;
    }

    std::string socketId = std::to_string(reinterpret_cast<uintptr_t>(ws));
    ArenaInstance* arenaInstance = nullptr;
    std::string instanceKey;
    long long nowMs = getCurrentTimeMs();

    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        if (mode == "training") {
            instanceKey = makeTrainingInstanceKey(userData->userId);
            trainingInstanceByUserId[userData->userId] = instanceKey;

            if (!arenaInstances.count(instanceKey)) {
                ArenaInstance newInstance;
                newInstance.key = instanceKey;
                newInstance.mode = "training";
                newInstance.world = std::make_unique<GameWorld>(instanceKey, "training");
                arenaInstances[instanceKey] = std::move(newInstance);
            }
        } else {
            if (matchId.empty()) {
                return false;
            }

            auto readyIt = readyMatchByUserId.find(userData->userId);
            if (readyIt == readyMatchByUserId.end() || readyIt->second != matchId) {
                return false;
            }

            auto activeMatchIt = activeMatches.find(matchId);
            if (activeMatchIt == activeMatches.end()) {
                return false;
            }

            instanceKey = activeMatchIt->second.instanceKey;
            activeMatchIt->second.playerSocketIds[userData->userId] = socketId;
            readyMatchByUserId.erase(readyIt);
        }

        arenaInstance = &arenaInstances[instanceKey];
        arenaInstance->playerIds.insert(socketId);
        arenaInstance->userIds.insert(userData->userId);
        playerInstanceBySocketId[socketId] = instanceKey;
    }

    {
        std::lock_guard<std::mutex> lock(clients_mtx);
        clients[socketId] = ws;
    }

    userData->id = socketId;
    userData->currentArenaMode = mode;
    userData->currentInstanceKey = instanceKey;
    userData->currentMatchId = mode == "match" ? matchId : "";

    arenaInstance->world->addPlayer(
        socketId,
        userData->nickname.empty() ? userData->username : userData->nickname,
        characterId,
        userData->role
    );

    json sessionInit = arenaInstance->world->getSessionInitJson(socketId);
    sessionInit["instance"] = {
        {"key", instanceKey},
        {"mode", mode}
    };

    if (mode == "match") {
        std::lock_guard<std::mutex> lock(arena_mtx);
        const ActiveMatchInstance& match = activeMatches[matchId];
        sessionInit["instance"]["matchId"] = match.matchId;
        sessionInit["instance"]["matchStartedAtMs"] = match.startedAtMs;
        sessionInit["instance"]["matchEndsAtMs"] = match.endsAtMs;
        sessionInit["instance"]["matchDurationMs"] = MATCH_DURATION_MS;
    }

    ws->send(sessionInit.dump(), uWS::OpCode::TEXT);

    std::string arenaMessagesError;
    std::vector<ArenaMessageRecord> recentArenaMessages = arenaChatRepository.listRecentMessages(
        instanceKey,
        30,
        &arenaMessagesError
    );
    if (arenaMessagesError.empty()) {
        json historyPayload = {
            {"event", "arenaChatSync"},
            {"messages", json::array()},
            {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
        };

        for (const ArenaMessageRecord& messageRecord : recentArenaMessages) {
            historyPayload["messages"].push_back({
                {"id", messageRecord.id},
                {"type", messageRecord.messageType.empty() ? "public" : messageRecord.messageType},
                {"senderUserId", messageRecord.senderUserId},
                {"senderNickname", messageRecord.senderNickname},
                {"senderTag", messageRecord.senderTag},
                {"body", messageRecord.body},
                {"targetUserId", messageRecord.targetUserId > 0 ? json(messageRecord.targetUserId) : json(nullptr)},
                {"createdAt", messageRecord.createdAtMs}
            });
        }

        ws->send(historyPayload.dump(), uWS::OpCode::TEXT);
    }

    broadcastToInstance(instanceKey, json({
        {"event", "playerJoined"},
        {"player", arenaInstance->world->getPlayerJson(socketId)}
    }).dump());

    (void)nowMs;
    return true;
}

void NetworkHandler::removeFromArenaInstance(uWS::WebSocket<false, true, PerSocketData>* ws, PerSocketData* userData) {
    if (userData == nullptr || userData->id.empty()) {
        return;
    }

    const std::string socketId = userData->id;
    const std::string instanceKey = userData->currentInstanceKey;
    const std::string matchId = userData->currentMatchId;
    const long long userId = userData->userId;

    {
        std::lock_guard<std::mutex> lock(clients_mtx);
        clients.erase(socketId);
    }

    {
        std::lock_guard<std::mutex> lock(arena_mtx);
        auto instanceIt = arenaInstances.find(instanceKey);
        if (instanceIt != arenaInstances.end()) {
            if (instanceIt->second.world) {
                instanceIt->second.world->removePlayer(socketId);
            }
            instanceIt->second.playerIds.erase(socketId);
            instanceIt->second.userIds.erase(userId);
            if (instanceIt->second.userIds.empty() && instanceIt->second.mode == "training") {
                arenaInstances.erase(instanceIt);
                trainingInstanceByUserId.erase(userId);
            } else if (instanceIt->second.userIds.empty() && instanceIt->second.mode == "match") {
                const std::optional<std::string> finishedMatchId = instanceIt->second.matchId;
                arenaInstances.erase(instanceIt);
                if (finishedMatchId.has_value()) {
                    activeMatches.erase(*finishedMatchId);
                }
            }
        }
        playerInstanceBySocketId.erase(socketId);
    }

    if (!instanceKey.empty()) {
        broadcastToInstance(instanceKey, json({{"event", "playerLeft"}, {"id", socketId}}).dump());
    }

    if (!matchId.empty()) {
        finishMatch(matchId, "disconnect", userId);
    }

    userData->id.clear();
    userData->currentArenaMode.clear();
    userData->currentInstanceKey.clear();
    userData->currentMatchId.clear();
}

void NetworkHandler::registerAuthenticatedSocket(
    uWS::WebSocket<false, true, PerSocketData>* ws,
    PerSocketData* userData
) {
    if (userData == nullptr || userData->userId <= 0) {
        return;
    }

    std::lock_guard<std::mutex> lock(social_mtx);
    authenticatedSockets[userData->userId].insert(ws);
    onlineUserCounts[userData->userId] = static_cast<int>(authenticatedSockets[userData->userId].size());
}

void NetworkHandler::unregisterAuthenticatedSocket(
    uWS::WebSocket<false, true, PerSocketData>* ws,
    const PerSocketData* userData
) {
    if (userData == nullptr || userData->userId <= 0) {
        return;
    }

    std::lock_guard<std::mutex> lock(social_mtx);
    auto mapIt = authenticatedSockets.find(userData->userId);
    if (mapIt == authenticatedSockets.end()) {
        onlineUserCounts.erase(userData->userId);
        return;
    }

    mapIt->second.erase(ws);
    if (mapIt->second.empty()) {
        authenticatedSockets.erase(mapIt);
        onlineUserCounts.erase(userData->userId);
        return;
    }

    onlineUserCounts[userData->userId] = static_cast<int>(mapIt->second.size());
}

bool NetworkHandler::isUserOnline(long long userId) {
    std::lock_guard<std::mutex> lock(social_mtx);
    auto it = onlineUserCounts.find(userId);
    return it != onlineUserCounts.end() && it->second > 0;
}

json NetworkHandler::buildFriendsSyncPayload(long long userId, std::string* error) {
    std::string repositoryError;
    std::vector<FriendshipSummary> friends = friendshipRepository.listAcceptedFriends(userId, &repositoryError);
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    repositoryError.clear();
    std::vector<FriendRequestSummary> incomingRequests = friendshipRepository.listIncomingRequests(userId, &repositoryError);
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    repositoryError.clear();
    std::vector<FriendRequestSummary> outgoingRequests = friendshipRepository.listOutgoingRequests(userId, &repositoryError);
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    json payload = {
        {"event", "friendsSync"},
        {"friends", json::array()},
        {"incomingRequests", json::array()},
        {"outgoingRequests", json::array()},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };

    for (const FriendshipSummary& friendSummary : friends) {
        payload["friends"].push_back({
            {"userId", friendSummary.userId},
            {"nickname", friendSummary.nickname},
            {"tag", friendSummary.tag},
            {"online", isUserOnline(friendSummary.userId)}
        });
    }

    for (const FriendRequestSummary& requestSummary : incomingRequests) {
        payload["incomingRequests"].push_back({
            {"requestId", requestSummary.requestId},
            {"requesterId", requestSummary.requesterId},
            {"nickname", requestSummary.nickname},
            {"tag", requestSummary.tag}
        });
    }

    for (const FriendRequestSummary& requestSummary : outgoingRequests) {
        payload["outgoingRequests"].push_back({
            {"requestId", requestSummary.requestId},
            {"addresseeId", requestSummary.addresseeId},
            {"nickname", requestSummary.nickname},
            {"tag", requestSummary.tag}
        });
    }

    return payload;
}

json NetworkHandler::buildPrivateChatsSyncPayload(long long userId, std::string* error) {
    std::string repositoryError;
    std::vector<FriendshipSummary> friends = friendshipRepository.listAcceptedFriends(userId, &repositoryError);
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    json payload = {
        {"event", "privateChatsSync"},
        {"conversations", json::array()},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };

    for (const FriendshipSummary& friendSummary : friends) {
        repositoryError.clear();
        std::optional<PrivateMessageRecord> lastMessage = privateChatRepository.findLastMessageBetween(
            userId,
            friendSummary.userId,
            &repositoryError
        );
        if (!repositoryError.empty()) {
            if (error != nullptr) {
                *error = repositoryError;
            }
            return json();
        }

        repositoryError.clear();
        int unreadCount = privateChatRepository.countUnreadMessages(
            userId,
            friendSummary.userId,
            &repositoryError
        );
        if (!repositoryError.empty()) {
            if (error != nullptr) {
                *error = repositoryError;
            }
            return json();
        }

        json conversation = {
            {"friendUserId", friendSummary.userId},
            {"nickname", friendSummary.nickname},
            {"tag", friendSummary.tag},
            {"online", isUserOnline(friendSummary.userId)},
            {"unreadCount", unreadCount},
            {"lastMessagePreview", lastMessage.has_value() ? lastMessage->body : ""},
            {"lastMessageAt", lastMessage.has_value() ? lastMessage->createdAtMs : 0}
        };
        payload["conversations"].push_back(conversation);
    }

    return payload;
}

json NetworkHandler::buildAdminUserLookupPayload(
    long long requesterUserId,
    const std::string& nickname,
    const std::string& tag,
    std::string* error
) {
    std::string repositoryError;
    std::optional<UserLookupWithProfile> target = userRepository.findWithProfileByNicknameAndTag(nickname, tag, &repositoryError);
    if (!target.has_value()) {
        if (error != nullptr) {
            *error = repositoryError.empty() ? "Target user was not found" : repositoryError;
        }
        return json();
    }

    repositoryError.clear();
    std::optional<ActiveBanRecord> activeBan = moderationRepository.findActiveBanByUserId(target->user.id, &repositoryError);
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    repositoryError.clear();
    bool alreadyFriends = friendshipRepository.findAcceptedLink(requesterUserId, target->user.id, &repositoryError).has_value();
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    return buildLookupPayloadJson(target.value(), alreadyFriends, isUserOnline(target->user.id), activeBan);
}

json NetworkHandler::buildAdminReportsSyncPayload(std::string* error) {
    std::string repositoryError;
    std::vector<PlayerReportRecord> openReports = reportRepository.listOpenReports(&repositoryError);
    if (!repositoryError.empty()) {
        if (error != nullptr) {
            *error = repositoryError;
        }
        return json();
    }

    json payload = {
        {"event", "adminReportsSync"},
        {"reports", json::array()},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };

    for (const PlayerReportRecord& report : openReports) {
        repositoryError.clear();
        std::optional<UserLookupWithProfile> target = userRepository.findWithProfileByNicknameAndTag(
            report.targetNickname,
            report.targetTag,
            &repositoryError
        );
        if (!repositoryError.empty()) {
            if (error != nullptr) {
                *error = repositoryError;
            }
            return json();
        }

        repositoryError.clear();
        std::optional<ActiveBanRecord> activeBan = moderationRepository.findActiveBanByUserId(report.targetUserId, &repositoryError);
        if (!repositoryError.empty()) {
            if (error != nullptr) {
                *error = repositoryError;
            }
            return json();
        }

        repositoryError.clear();
        std::vector<ArenaMessageRecord> recentMessages = arenaChatRepository.listRecentMessagesBySender(
            report.targetUserId,
            60,
            100,
            &repositoryError
        );
        if (!repositoryError.empty()) {
            if (error != nullptr) {
                *error = repositoryError;
            }
            return json();
        }

        json reportPayload = {
            {"id", report.id},
            {"createdAtMs", report.createdAtMs},
            {"status", report.status},
            {"description", report.description},
            {"reasonCodes", json::parse(report.reasonCodesJson.empty() ? "[]" : report.reasonCodesJson)},
            {"reporter", {
                {"userId", report.reporterUserId},
                {"nickname", report.reporterNickname},
                {"tag", report.reporterTag}
            }},
            {"target", {
                {"userId", report.targetUserId},
                {"nickname", report.targetNickname.empty() ? report.targetNicknameSnapshot : report.targetNickname},
                {"tag", report.targetTag.empty() ? report.targetTagSnapshot : report.targetTag}
            }},
            {"activeBan", activeBan.has_value()
                ? json{
                    {"id", activeBan->id},
                    {"reason", activeBan->reason},
                    {"isPermanent", activeBan->isPermanent},
                    {"createdAtMs", activeBan->createdAtMs},
                    {"bannedUntilMs", activeBan->bannedUntilMs},
                    {"bannedByDisplay", activeBan->bannedByNickname + activeBan->bannedByTag}
                }
                : json(nullptr)},
            {"arenaMessages", json::array()}
        };

        if (target.has_value()) {
            reportPayload["targetProfile"] = {
                {"username", target->user.username},
                {"email", target->user.email},
                {"role", target->user.role},
                {"online", isUserOnline(target->user.id)},
                {"coins", target->profile.coins}
            };
        } else {
            reportPayload["targetProfile"] = nullptr;
        }

        for (const ArenaMessageRecord& message : recentMessages) {
            reportPayload["arenaMessages"].push_back({
                {"id", message.id},
                {"type", message.messageType.empty() ? "public" : message.messageType},
                {"body", message.body},
                {"createdAt", message.createdAtMs},
                {"arenaKey", message.arenaKey},
                {"senderNickname", message.senderNickname},
                {"senderTag", message.senderTag}
            });
        }

        payload["reports"].push_back(reportPayload);
    }

    return payload;
}

void NetworkHandler::sendFriendsSyncToSocket(uWS::WebSocket<false, true, PerSocketData>* ws, long long userId) {
    std::string error;
    json payload = buildFriendsSyncPayload(userId, &error);
    if (payload.is_null() || payload.empty()) {
        ws->send(ProtocolPayloadBuilder::buildActionRejected(
            "friendsSync",
            "database_error",
            error.empty() ? "Could not load friend list" : error,
            world.getCurrentTick()
        ).dump(), uWS::OpCode::TEXT);
        return;
    }

    ws->send(payload.dump(), uWS::OpCode::TEXT);
}

void NetworkHandler::sendPrivateChatsSyncToSocket(uWS::WebSocket<false, true, PerSocketData>* ws, long long userId) {
    std::string error;
    json payload = buildPrivateChatsSyncPayload(userId, &error);
    if (payload.is_null() || payload.empty()) {
        ws->send(ProtocolPayloadBuilder::buildActionRejected(
            "privateChatsSync",
            "database_error",
            error.empty() ? "Could not load private chats" : error,
            world.getCurrentTick()
        ).dump(), uWS::OpCode::TEXT);
        return;
    }

    ws->send(payload.dump(), uWS::OpCode::TEXT);
}

void NetworkHandler::sendFriendsSyncToUser(long long userId) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> lock(social_mtx);
        auto it = authenticatedSockets.find(userId);
        if (it == authenticatedSockets.end()) {
            return;
        }

        sockets.assign(it->second.begin(), it->second.end());
    }

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        sendFriendsSyncToSocket(socket, userId);
    }
}

void NetworkHandler::sendFriendsSyncToUsers(const std::vector<long long>& userIds) {
    std::set<long long> uniqueIds(userIds.begin(), userIds.end());
    for (long long userId : uniqueIds) {
        sendFriendsSyncToUser(userId);
    }
}

void NetworkHandler::sendPrivateChatsSyncToUser(long long userId) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> lock(social_mtx);
        auto it = authenticatedSockets.find(userId);
        if (it == authenticatedSockets.end()) {
            return;
        }

        sockets.assign(it->second.begin(), it->second.end());
    }

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        sendPrivateChatsSyncToSocket(socket, userId);
    }
}

void NetworkHandler::sendPrivateChatsSyncToUsers(const std::vector<long long>& userIds) {
    std::set<long long> uniqueIds(userIds.begin(), userIds.end());
    for (long long userId : uniqueIds) {
        sendPrivateChatsSyncToUser(userId);
    }
}

void NetworkHandler::sendAdminReportsSyncToUser(long long userId) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> lock(social_mtx);
        auto it = authenticatedSockets.find(userId);
        if (it == authenticatedSockets.end()) {
            return;
        }
        sockets.assign(it->second.begin(), it->second.end());
    }

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        PerSocketData* socketData = socket->getUserData();
        if (socketData == nullptr || socketData->role != "admin") {
            continue;
        }

        std::string error;
        json payload = buildAdminReportsSyncPayload(&error);
        if (payload.is_null() || payload.empty()) {
            socket->send(ProtocolPayloadBuilder::buildActionRejected(
                "adminReportsSync",
                "database_error",
                error.empty() ? "Could not load reports" : error,
                world.getCurrentTick()
            ).dump(), uWS::OpCode::TEXT);
            continue;
        }

        socket->send(payload.dump(), uWS::OpCode::TEXT);
    }
}

void NetworkHandler::notifyFriendsPresenceChanged(long long userId) {
    std::string error;
    std::vector<long long> friendIds = friendshipRepository.listAcceptedFriendIds(userId, &error);
    if (!error.empty()) {
        return;
    }

    friendIds.push_back(userId);
    sendFriendsSyncToUsers(friendIds);
    sendPrivateChatsSyncToUsers(friendIds);
}

void NetworkHandler::sendArenaPublicMessage(const json& payload) {
    std::lock_guard<std::mutex> lock(clients_mtx);
    for (auto const& [id, ws] : clients) {
        (void)id;
        ws->send(payload.dump(), uWS::OpCode::TEXT);
    }
}

void NetworkHandler::sendPrivateMessageToUser(long long userId, const json& payload, bool alsoSendArenaWhisper) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> lock(social_mtx);
        auto it = authenticatedSockets.find(userId);
        if (it == authenticatedSockets.end()) {
            return;
        }

        sockets.assign(it->second.begin(), it->second.end());
    }

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        PerSocketData* userData = socket->getUserData();
        if (userData != nullptr && payload.value("event", "") == "privateMessageReceived") {
            userData->lastWhisperFromUserId = payload.value("friendUserId", 0LL);
            userData->lastWhisperFromDisplay = payload.value("nickname", "") + payload.value("tag", "");
        }

        socket->send(payload.dump(), uWS::OpCode::TEXT);
        if (alsoSendArenaWhisper) {
            if (userData != nullptr && !userData->id.empty()) {
                json whisperPayload = payload;
                whisperPayload["event"] = "arenaWhisper";
                socket->send(whisperPayload.dump(), uWS::OpCode::TEXT);
            }
        }
    }
}

void NetworkHandler::disconnectUserSessions(long long userId, const json& payload) {
    std::vector<uWS::WebSocket<false, true, PerSocketData>*> sockets;
    {
        std::lock_guard<std::mutex> lock(social_mtx);
        auto it = authenticatedSockets.find(userId);
        if (it != authenticatedSockets.end()) {
            sockets.assign(it->second.begin(), it->second.end());
        }
    }

    sessionService.invalidateSessionsForUser(userId);

    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
        socket->send(payload.dump(), uWS::OpCode::TEXT);
        socket->close();
    }
}

void NetworkHandler::start() {
    uWS::App().ws<PerSocketData>("/*", {
        .compression = uWS::SHARED_COMPRESSOR,
        .open = [](auto *ws) {
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
                nh->updatePendingMatches();
                nh->updateRunningMatches();
                nh->updateArenaInstances();
            }, DRAGON_ARENA_TICK_INTERVAL_MS, DRAGON_ARENA_TICK_INTERVAL_MS);
        }
    }).run();
}

void NetworkHandler::broadcast(const std::string &message) {
    if (!broadcastContextInstanceKey.empty()) {
        broadcastToInstance(broadcastContextInstanceKey, message);
        return;
    }

    std::lock_guard<std::mutex> lock(clients_mtx);
    for (auto const& [id, ws] : clients) {
        (void)id;
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

        auto getCurrentArenaWorld = [&]() -> GameWorld* {
            if (userData == nullptr || userData->currentInstanceKey.empty()) {
                return nullptr;
            }

            std::lock_guard<std::mutex> lock(arena_mtx);
            auto instanceIt = arenaInstances.find(userData->currentInstanceKey);
            if (instanceIt == arenaInstances.end() || !instanceIt->second.world) {
                return nullptr;
            }

            return instanceIt->second.world.get();
        };

        auto isCurrentMatchFinished = [&]() -> bool {
            if (userData == nullptr || userData->currentMatchId.empty()) {
                return false;
            }

            std::lock_guard<std::mutex> lock(arena_mtx);
            auto matchIt = activeMatches.find(userData->currentMatchId);
            return matchIt != activeMatches.end() && matchIt->second.finished;
        };
        
        if (event == "register") {
            if (!hasString(data, "email") || !hasString(data, "username") || !hasString(data, "nickname") || !hasString(data, "password")) {
                ws->send(ProtocolPayloadBuilder::buildAuthError("invalid_payload", "register requires string email, username, nickname and password").dump(), uWS::OpCode::TEXT);
                return;
            }

            AuthResult auth = authService.registerUser(data["email"], data["username"], data["nickname"], data["password"]);
            if (!auth.ok || !auth.authenticatedUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(auth.code, auth.message, auth.extras).dump(), uWS::OpCode::TEXT);
                return;
            }

            SessionAuthResult session = sessionService.createSession(*auth.authenticatedUser);
            if (!session.ok || !session.authenticatedSession.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(session.code, session.message, session.extras).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->authenticated = true;
            userData->userId = session.authenticatedSession->authenticatedUser.user.id;
            userData->email = session.authenticatedSession->authenticatedUser.user.email;
            userData->username = session.authenticatedSession->authenticatedUser.user.username;
            userData->nickname = session.authenticatedSession->authenticatedUser.user.nickname;
            userData->tag = session.authenticatedSession->authenticatedUser.user.tag;
            userData->role = session.authenticatedSession->authenticatedUser.user.role;
            registerAuthenticatedSocket(ws, userData);
            ws->send(ProtocolPayloadBuilder::buildAuthSuccess(
                "register",
                session.authenticatedSession->authenticatedUser,
                session.authenticatedSession->session.token,
                session.authenticatedSession->session.expiresAtMs
            ).dump(), uWS::OpCode::TEXT);
            notifyFriendsPresenceChanged(userData->userId);
        }
        else if (event == "login") {
            if (!hasString(data, "identifier") || !hasString(data, "password")) {
                ws->send(ProtocolPayloadBuilder::buildAuthError("invalid_payload", "login requires string identifier and password").dump(), uWS::OpCode::TEXT);
                return;
            }

            AuthResult auth = authService.loginUser(data["identifier"], data["password"]);
            if (!auth.ok || !auth.authenticatedUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(auth.code, auth.message, auth.extras).dump(), uWS::OpCode::TEXT);
                return;
            }

            SessionAuthResult session = sessionService.createSession(*auth.authenticatedUser);
            if (!session.ok || !session.authenticatedSession.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(session.code, session.message, session.extras).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->authenticated = true;
            userData->userId = session.authenticatedSession->authenticatedUser.user.id;
            userData->email = session.authenticatedSession->authenticatedUser.user.email;
            userData->username = session.authenticatedSession->authenticatedUser.user.username;
            userData->nickname = session.authenticatedSession->authenticatedUser.user.nickname;
            userData->tag = session.authenticatedSession->authenticatedUser.user.tag;
            userData->role = session.authenticatedSession->authenticatedUser.user.role;
            registerAuthenticatedSocket(ws, userData);
            ws->send(ProtocolPayloadBuilder::buildAuthSuccess(
                "login",
                session.authenticatedSession->authenticatedUser,
                session.authenticatedSession->session.token,
                session.authenticatedSession->session.expiresAtMs
            ).dump(), uWS::OpCode::TEXT);
            notifyFriendsPresenceChanged(userData->userId);
        }
        else if (event == "authToken") {
            if (!hasString(data, "token")) {
                ws->send(ProtocolPayloadBuilder::buildAuthError("invalid_payload", "authToken requires string token").dump(), uWS::OpCode::TEXT);
                return;
            }

            SessionAuthResult session = sessionService.authenticateToken(data["token"]);
            if (!session.ok || !session.authenticatedSession.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildAuthError(session.code, session.message, session.extras).dump(), uWS::OpCode::TEXT);
                return;
            }

            userData->authenticated = true;
            userData->userId = session.authenticatedSession->authenticatedUser.user.id;
            userData->email = session.authenticatedSession->authenticatedUser.user.email;
            userData->username = session.authenticatedSession->authenticatedUser.user.username;
            userData->nickname = session.authenticatedSession->authenticatedUser.user.nickname;
            userData->tag = session.authenticatedSession->authenticatedUser.user.tag;
            userData->role = session.authenticatedSession->authenticatedUser.user.role;
            registerAuthenticatedSocket(ws, userData);
            ws->send(ProtocolPayloadBuilder::buildAuthSuccess(
                "session",
                session.authenticatedSession->authenticatedUser,
                session.authenticatedSession->session.token,
                session.authenticatedSession->session.expiresAtMs
            ).dump(), uWS::OpCode::TEXT);
            notifyFriendsPresenceChanged(userData->userId);
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
            userData->tag = user->tag;
            userData->role = user->role;

            ws->send(ProtocolPayloadBuilder::buildProfileSync(AuthenticatedUser{*user, *profile}).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "contentSync") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("contentSync", "not_authenticated", "Client must authenticate before syncing content", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            ws->send(ProtocolPayloadBuilder::buildGameplayContent().dump(), uWS::OpCode::TEXT);
        }
        else if (event == "friendsSync") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("friendsSync", "not_authenticated", "Client must authenticate before syncing friends", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendFriendsSyncToSocket(ws, userData->userId);
        }
        else if (event == "privateChatsSync") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateChatsSync", "not_authenticated", "Client must authenticate before syncing private chats", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendPrivateChatsSyncToSocket(ws, userData->userId);
        }
        else if (event == "privateChatOpen") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateChatOpen", "not_authenticated", "Client must authenticate before opening a private chat", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("friendUserId") || !data["friendUserId"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateChatOpen", "invalid_payload", "privateChatOpen requires integer friendUserId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long friendUserId = data["friendUserId"];
            std::string repositoryError;
            std::optional<FriendshipLinkRecord> acceptedLink = friendshipRepository.findAcceptedLink(
                userData->userId,
                friendUserId,
                &repositoryError
            );
            if (!acceptedLink.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "privateChatOpen",
                    repositoryError.empty() ? "friend_not_found" : "database_error",
                    repositoryError.empty() ? "Friendship was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            repositoryError.clear();
            std::optional<UserRecord> friendUser = userRepository.findById(friendUserId, &repositoryError);
            if (!friendUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "privateChatOpen",
                    repositoryError.empty() ? "user_not_found" : "database_error",
                    repositoryError.empty() ? "Friend user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            repositoryError.clear();
            std::vector<PrivateMessageRecord> messages = privateChatRepository.listConversationMessages(
                userData->userId,
                friendUserId,
                50,
                &repositoryError
            );
            if (!repositoryError.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateChatOpen", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            repositoryError.clear();
            if (!privateChatRepository.markConversationRead(userData->userId, friendUserId, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateChatOpen", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            json payload = {
                {"event", "privateChatHistory"},
                {"friendUserId", friendUserId},
                {"nickname", friendUser->nickname},
                {"tag", friendUser->tag},
                {"messages", json::array()},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            };

            for (const PrivateMessageRecord& messageRecord : messages) {
                payload["messages"].push_back({
                    {"id", messageRecord.id},
                    {"direction", messageRecord.senderId == userData->userId ? "out" : "in"},
                    {"body", messageRecord.body},
                    {"createdAt", messageRecord.createdAtMs},
                    {"read", messageRecord.read}
                });
            }

            ws->send(payload.dump(), uWS::OpCode::TEXT);
            sendPrivateChatsSyncToUsers({userData->userId, friendUserId});
        }
        else if (event == "privateMessagesMarkRead") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessagesMarkRead", "not_authenticated", "Client must authenticate before marking messages as read", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("friendUserId") || !data["friendUserId"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessagesMarkRead", "invalid_payload", "privateMessagesMarkRead requires integer friendUserId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long friendUserId = data["friendUserId"];
            std::string repositoryError;
            if (!privateChatRepository.markConversationRead(userData->userId, friendUserId, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessagesMarkRead", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendPrivateChatsSyncToUsers({userData->userId, friendUserId});
        }
        else if (event == "privateMessageSend") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessageSend", "not_authenticated", "Client must authenticate before sending private messages", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("friendUserId") || !data["friendUserId"].is_number_integer() || !hasString(data, "body")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessageSend", "invalid_payload", "privateMessageSend requires integer friendUserId and string body", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long friendUserId = data["friendUserId"];
            const std::string body = trimCopy(data["body"]);
            if (body.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessageSend", "chat_empty_message", "Private message body is required", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (body.size() > 400) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessageSend", "chat_message_too_long", "Private message exceeds the maximum length", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            std::optional<FriendshipLinkRecord> acceptedLink = friendshipRepository.findAcceptedLink(
                userData->userId,
                friendUserId,
                &repositoryError
            );
            if (!acceptedLink.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "privateMessageSend",
                    repositoryError.empty() ? "chat_not_friends" : "database_error",
                    repositoryError.empty() ? "Private messages are only available between friends" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            repositoryError.clear();
            std::optional<UserRecord> friendUser = userRepository.findById(friendUserId, &repositoryError);
            if (!friendUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "privateMessageSend",
                    repositoryError.empty() ? "chat_invalid_target" : "database_error",
                    repositoryError.empty() ? "Target user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            PrivateMessageRecord messageRecord;
            if (!privateChatRepository.createMessage(userData->userId, friendUserId, body, &messageRecord, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("privateMessageSend", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            json senderPayload = {
                {"event", "privateMessageSent"},
                {"friendUserId", friendUserId},
                {"message", {
                    {"id", messageRecord.id},
                    {"direction", "out"},
                    {"body", messageRecord.body},
                    {"createdAt", messageRecord.createdAtMs},
                    {"read", false}
                }},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            };
            ws->send(senderPayload.dump(), uWS::OpCode::TEXT);

            json recipientPayload = {
                {"event", "privateMessageReceived"},
                {"friendUserId", userData->userId},
                {"nickname", userData->nickname},
                {"tag", userData->tag},
                {"message", {
                    {"id", messageRecord.id},
                    {"direction", "in"},
                    {"body", messageRecord.body},
                    {"createdAt", messageRecord.createdAtMs},
                    {"read", false}
                }},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            };
            sendPrivateMessageToUser(friendUserId, recipientPayload, true);
            sendPrivateChatsSyncToUsers({userData->userId, friendUserId});
        }
        else if (event == "sendFriendRequest") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "not_authenticated", "Client must authenticate before sending friend requests", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "nickname") || !hasString(data, "tag")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "invalid_payload", "sendFriendRequest requires string nickname and tag", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string targetNickname = data["nickname"];
            const std::string targetTag = data["tag"];
            std::string repositoryError;
            std::optional<UserRecord> targetUser = userRepository.findByNicknameAndTag(targetNickname, targetTag, &repositoryError);
            if (!targetUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "sendFriendRequest",
                    repositoryError.empty() ? "friend_target_not_found" : "database_error",
                    repositoryError.empty() ? "Target user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            if (targetUser->id == userData->userId) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "friend_self_add", "You cannot send a friend request to yourself", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            repositoryError.clear();
            std::optional<FriendshipLinkRecord> existingLink = friendshipRepository.findExistingLink(userData->userId, targetUser->id, &repositoryError);
            if (!repositoryError.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::vector<long long> affectedUsers = {userData->userId, targetUser->id};
            if (existingLink.has_value()) {
                if (existingLink->status == "accepted") {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "friend_already_added", "This user is already on your friend list", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }

                if (existingLink->status == "pending") {
                    if (existingLink->requesterId == userData->userId) {
                        ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "friend_request_pending", "A friend request is already pending for this user", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                        return;
                    }

                    FriendshipLinkRecord acceptedLink;
                    if (!friendshipRepository.updateRequestStatus(existingLink->id, "accepted", &acceptedLink, &repositoryError)) {
                        ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                        return;
                    }

                    sendFriendsSyncToUsers(affectedUsers);
                    sendPrivateChatsSyncToUsers(affectedUsers);
                    ws->send(json({
                        {"event", "friendRequestSent"},
                        {"mode", "accepted_existing"},
                        {"nickname", targetUser->nickname},
                        {"tag", targetUser->tag},
                        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                    }).dump(), uWS::OpCode::TEXT);
                    return;
                }
            }

            FriendshipLinkRecord link;
            if (!friendshipRepository.createPendingRequest(userData->userId, targetUser->id, &link, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("sendFriendRequest", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendFriendsSyncToUsers(affectedUsers);
            sendPrivateChatsSyncToUsers(affectedUsers);
            ws->send(json({
                {"event", "friendRequestSent"},
                {"mode", "pending"},
                {"nickname", targetUser->nickname},
                {"tag", targetUser->tag},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "respondFriendRequest") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respondFriendRequest", "not_authenticated", "Client must authenticate before responding to friend requests", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("requestId") || !data["requestId"].is_number_integer() || !hasString(data, "action")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respondFriendRequest", "invalid_payload", "respondFriendRequest requires integer requestId and string action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string action = data["action"];
            if (action != "accept" && action != "reject") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respondFriendRequest", "invalid_payload", "response action must be accept or reject", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            std::optional<FriendshipLinkRecord> pendingRequest = friendshipRepository.findPendingIncomingRequest(
                data["requestId"],
                userData->userId,
                &repositoryError
            );
            if (!pendingRequest.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "respondFriendRequest",
                    repositoryError.empty() ? "friend_request_not_found" : "database_error",
                    repositoryError.empty() ? "Friend request was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            FriendshipLinkRecord updatedRequest;
            if (!friendshipRepository.updateRequestStatus(
                pendingRequest->id,
                action == "accept" ? "accepted" : "rejected",
                &updatedRequest,
                &repositoryError
            )) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respondFriendRequest", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendFriendsSyncToUsers({userData->userId, updatedRequest.requesterId});
            sendPrivateChatsSyncToUsers({userData->userId, updatedRequest.requesterId});
            ws->send(json({
                {"event", "friendRequestResponded"},
                {"requestId", updatedRequest.id},
                {"action", action},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "cancelFriendRequest") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("cancelFriendRequest", "not_authenticated", "Client must authenticate before cancelling friend requests", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("requestId") || !data["requestId"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("cancelFriendRequest", "invalid_payload", "cancelFriendRequest requires integer requestId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            std::optional<FriendshipLinkRecord> pendingRequest = friendshipRepository.findPendingOutgoingRequest(
                data["requestId"],
                userData->userId,
                &repositoryError
            );
            if (!pendingRequest.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "cancelFriendRequest",
                    repositoryError.empty() ? "friend_request_not_found" : "database_error",
                    repositoryError.empty() ? "Friend request was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            FriendshipLinkRecord updatedRequest;
            if (!friendshipRepository.updateRequestStatus(
                pendingRequest->id,
                "cancelled",
                &updatedRequest,
                &repositoryError
            )) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("cancelFriendRequest", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendFriendsSyncToUsers({userData->userId, updatedRequest.addresseeId});
            sendPrivateChatsSyncToUsers({userData->userId, updatedRequest.addresseeId});
            ws->send(json({
                {"event", "friendRequestCancelled"},
                {"requestId", updatedRequest.id},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "removeFriend") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("removeFriend", "not_authenticated", "Client must authenticate before removing friends", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("friendUserId") || !data["friendUserId"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("removeFriend", "invalid_payload", "removeFriend requires integer friendUserId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long friendUserId = data["friendUserId"];
            std::string repositoryError;
            std::optional<FriendshipLinkRecord> acceptedLink = friendshipRepository.findAcceptedLink(
                userData->userId,
                friendUserId,
                &repositoryError
            );
            if (!acceptedLink.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "removeFriend",
                    repositoryError.empty() ? "friend_not_found" : "database_error",
                    repositoryError.empty() ? "Friendship was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            if (!friendshipRepository.deleteLink(acceptedLink->id, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("removeFriend", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            sendFriendsSyncToUsers({userData->userId, friendUserId});
            sendPrivateChatsSyncToUsers({userData->userId, friendUserId});
            ws->send(json({
                {"event", "friendRemoved"},
                {"friendUserId", friendUserId},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "submitPlayerReport") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "not_authenticated", "Client must authenticate before submitting reports", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "nickname") || !hasString(data, "tag") || !hasString(data, "description") || !data.contains("reasonCodes") || !data["reasonCodes"].is_array()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "invalid_payload", "submitPlayerReport requires nickname, tag, description and reasonCodes", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string nickname = trimCopy(data["nickname"]);
            const std::string tag = trimCopy(data["tag"]);
            const std::string description = trimCopy(data["description"]);
            if (nickname.empty() || tag.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "report_target_required", "Nickname and tag are required", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (description.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "report_description_required", "A description is required", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (description.size() > 500) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "report_description_too_long", "Description exceeds the maximum length", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::vector<std::string> reasonCodes;
            for (const auto& entry : data["reasonCodes"]) {
                if (!entry.is_string()) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "invalid_payload", "reasonCodes must contain strings only", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
                const std::string reasonCode = trimCopy(entry.get<std::string>());
                if (!isAllowedReportReason(reasonCode)) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "report_invalid_reason", "One or more report reasons are invalid", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
                if (std::find(reasonCodes.begin(), reasonCodes.end(), reasonCode) == reasonCodes.end()) {
                    reasonCodes.push_back(reasonCode);
                }
            }

            if (reasonCodes.empty() || reasonCodes.size() > 3) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "report_invalid_reason_count", "Select between 1 and 3 report reasons", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            std::optional<UserRecord> targetUser = userRepository.findByNicknameAndTag(nickname, tag, &repositoryError);
            if (!targetUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "submitPlayerReport",
                    repositoryError.empty() ? "report_target_not_found" : "database_error",
                    repositoryError.empty() ? "Target user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            if (targetUser->id == userData->userId) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "report_self_forbidden", "You cannot report yourself", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            PlayerReportRecord createdReport;
            if (!reportRepository.createReport(
                userData->userId,
                targetUser->id,
                targetUser->nickname,
                targetUser->tag,
                json(reasonCodes).dump(),
                description,
                &createdReport,
                &repositoryError
            )) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("submitPlayerReport", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            ws->send(json({
                {"event", "playerReportSubmitted"},
                {"reportId", createdReport.id},
                {"targetUserId", targetUser->id},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);

            std::set<long long> adminUserIds;
            {
                std::lock_guard<std::mutex> lock(social_mtx);
                for (const auto& [authenticatedUserId, sockets] : authenticatedSockets) {
                    for (uWS::WebSocket<false, true, PerSocketData>* socket : sockets) {
                        PerSocketData* socketData = socket->getUserData();
                        if (socketData != nullptr && socketData->role == "admin") {
                            adminUserIds.insert(authenticatedUserId);
                            break;
                        }
                    }
                }
            }
            for (long long adminUserId : adminUserIds) {
                sendAdminReportsSyncToUser(adminUserId);
            }
        }
        else if (event == "adminLookupUser") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminLookupUser", "not_authenticated", "Client must authenticate before using admin tools", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->role != "admin") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminLookupUser", "admin_forbidden", "Only admins can use this action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "nickname") || !hasString(data, "tag")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminLookupUser", "invalid_payload", "adminLookupUser requires string nickname and tag", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string nickname = trimCopy(data["nickname"]);
            const std::string tag = trimCopy(data["tag"]);
            std::string repositoryError;
            json payload = buildAdminUserLookupPayload(userData->userId, nickname, tag, &repositoryError);
            if (payload.is_null() || payload.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "adminLookupUser",
                    repositoryError == "Target user was not found" ? "admin_target_not_found" : "database_error",
                    repositoryError.empty() ? "Target user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }
            ws->send(payload.dump(), uWS::OpCode::TEXT);
        }
        else if (event == "adminReportsSync") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminReportsSync", "not_authenticated", "Client must authenticate before using admin tools", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->role != "admin") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminReportsSync", "admin_forbidden", "Only admins can use this action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            json payload = buildAdminReportsSyncPayload(&repositoryError);
            if (payload.is_null() || payload.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminReportsSync", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            ws->send(payload.dump(), uWS::OpCode::TEXT);
        }
        else if (event == "adminForceAddFriend") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "not_authenticated", "Client must authenticate before using admin tools", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->role != "admin") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "admin_forbidden", "Only admins can use this action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("targetUserId") || !data["targetUserId"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "invalid_payload", "adminForceAddFriend requires integer targetUserId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long targetUserId = data["targetUserId"];
            if (targetUserId == userData->userId) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "friend_self_add", "You cannot add yourself", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            std::optional<UserRecord> targetUser = userRepository.findById(targetUserId, &repositoryError);
            if (!targetUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "adminForceAddFriend",
                    repositoryError.empty() ? "admin_target_not_found" : "database_error",
                    repositoryError.empty() ? "Target user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::optional<FriendshipLinkRecord> existingLink = friendshipRepository.findExistingLink(userData->userId, targetUserId, &repositoryError);
            if (!repositoryError.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            if (existingLink.has_value()) {
                if (existingLink->status == "accepted") {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "friend_already_added", "This user is already on your friend list", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }

                FriendshipLinkRecord updatedLink;
                if (!friendshipRepository.updateRequestStatus(existingLink->id, "accepted", &updatedLink, &repositoryError)) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
            } else {
                FriendshipLinkRecord createdLink;
                if (!friendshipRepository.createAcceptedLink(userData->userId, targetUserId, &createdLink, &repositoryError)) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("adminForceAddFriend", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
            }

            sendFriendsSyncToUsers({userData->userId, targetUserId});
            sendPrivateChatsSyncToUsers({userData->userId, targetUserId});
            ws->send(json({
                {"event", "adminActionSuccess"},
                {"action", "force_add_friend"},
                {"message", "Friendship added successfully."},
                {"targetUserId", targetUserId},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "adminBanUser") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "not_authenticated", "Client must authenticate before using admin tools", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->role != "admin") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "admin_forbidden", "Only admins can use this action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("targetUserId") || !data["targetUserId"].is_number_integer() || !hasString(data, "reason") || !data.contains("isPermanent") || !data["isPermanent"].is_boolean()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "invalid_payload", "adminBanUser requires targetUserId, reason and isPermanent", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long targetUserId = data["targetUserId"];
            const std::string reason = trimCopy(data["reason"]);
            const bool isPermanent = data["isPermanent"];
            if (targetUserId == userData->userId) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "admin_self_ban_forbidden", "You cannot ban yourself", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (reason.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "admin_ban_reason_required", "Ban reason is required", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::optional<long long> durationMs = std::nullopt;
            if (!isPermanent) {
                if (!data.contains("durationMs") || !data["durationMs"].is_number_integer()) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "invalid_payload", "Temporary bans require durationMs", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
                long long requestedDurationMs = data["durationMs"];
                if (requestedDurationMs <= 0) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "invalid_payload", "durationMs must be greater than zero", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
                durationMs = requestedDurationMs;
            }

            std::string repositoryError;
            std::optional<UserRecord> targetUser = userRepository.findById(targetUserId, &repositoryError);
            if (!targetUser.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected(
                    "adminBanUser",
                    repositoryError.empty() ? "admin_target_not_found" : "database_error",
                    repositoryError.empty() ? "Target user was not found" : repositoryError,
                    world.getCurrentTick()
                ).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::optional<ActiveBanRecord> existingBan = moderationRepository.findActiveBanByUserId(targetUserId, &repositoryError);
            if (!repositoryError.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (existingBan.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "admin_ban_already_active", "This user already has an active ban", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long currentTimeMs = static_cast<long long>(std::time(nullptr)) * 1000;
            std::optional<long long> bannedUntilMs = isPermanent || !durationMs.has_value()
                ? std::nullopt
                : std::optional<long long>(currentTimeMs + *durationMs);

            ActiveBanRecord createdBan;
            if (!moderationRepository.createBan(targetUserId, userData->userId, reason, bannedUntilMs, isPermanent, &createdBan, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminBanUser", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            json authPayload = ProtocolPayloadBuilder::buildAuthError(
                "user_banned",
                isPermanent
                    ? "This account has been permanently banned. Reason: " + reason
                    : "This account is banned. Reason: " + reason,
                {
                    {"banReason", reason},
                    {"isPermanent", isPermanent},
                    {"bannedUntilMs", createdBan.bannedUntilMs}
                }
            );
            disconnectUserSessions(targetUserId, authPayload);
            sendFriendsSyncToUser(targetUserId);
            ws->send(json({
                {"event", "adminActionSuccess"},
                {"action", "ban_user"},
                {"message", "User banned successfully."},
                {"targetUserId", targetUserId},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
            sendAdminReportsSyncToUser(userData->userId);
        }
        else if (event == "adminUnbanUser") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminUnbanUser", "not_authenticated", "Client must authenticate before using admin tools", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->role != "admin") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminUnbanUser", "admin_forbidden", "Only admins can use this action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("targetUserId") || !data["targetUserId"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminUnbanUser", "invalid_payload", "adminUnbanUser requires integer targetUserId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long targetUserId = data["targetUserId"];
            std::string repositoryError;
            std::optional<ActiveBanRecord> activeBan = moderationRepository.findActiveBanByUserId(targetUserId, &repositoryError);
            if (!repositoryError.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminUnbanUser", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!activeBan.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminUnbanUser", "admin_ban_not_found", "No active ban was found for this user", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            ActiveBanRecord revokedBan;
            if (!moderationRepository.revokeActiveBan(targetUserId, userData->userId, &revokedBan, &repositoryError)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminUnbanUser", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            ws->send(json({
                {"event", "adminActionSuccess"},
                {"action", "unban_user"},
                {"message", "User unbanned successfully."},
                {"targetUserId", targetUserId},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
        }
        else if (event == "adminResolveReport") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminResolveReport", "not_authenticated", "Client must authenticate before using admin tools", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->role != "admin") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminResolveReport", "admin_forbidden", "Only admins can use this action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!data.contains("reportId") || !data["reportId"].is_number_integer() || !hasString(data, "action")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminResolveReport", "invalid_payload", "adminResolveReport requires reportId and action", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const long long reportId = data["reportId"];
            const std::string action = trimCopy(data["action"]);
            if (action != "accept" && action != "reject") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminResolveReport", "invalid_payload", "adminResolveReport action must be accept or reject", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            std::string repositoryError;
            PlayerReportRecord resolvedReport;
            if (!reportRepository.resolveReport(
                reportId,
                action == "accept" ? "accepted" : "rejected",
                userData->userId,
                &resolvedReport,
                &repositoryError
            )) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("adminResolveReport", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            ws->send(json({
                {"event", "adminActionSuccess"},
                {"action", action == "accept" ? "accept_report" : "reject_report"},
                {"reportId", resolvedReport.id},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
            sendAdminReportsSyncToUser(userData->userId);
        }
        else if (event == "queueMatch") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("queueMatch", "not_authenticated", "Client must authenticate before queueing", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "characterId")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("queueMatch", "invalid_payload", "queueMatch requires string characterId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            {
                std::lock_guard<std::mutex> lock(arena_mtx);
                if (queuedPlayersByUserId.count(userData->userId) || pendingMatchByUserId.count(userData->userId) ||
                    readyMatchByUserId.count(userData->userId) || activeMatchByUserId.count(userData->userId)) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("queueMatch", "already_queueing", "Player is already in the matchmaking flow", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }
            }

            enqueuePlayerForMatch({
                userData->userId,
                userData->nickname.empty() ? userData->username : userData->nickname,
                userData->tag,
                userData->role,
                data["characterId"],
                getCurrentTimeMs()
            });

            ws->send(json({
                {"event", "matchQueueStarted"},
                {"characterId", data["characterId"]},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);
            tryCreatePendingMatch();
        }
        else if (event == "leaveQueue") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("leaveQueue", "not_authenticated", "Client must authenticate before leaving queue", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            bool removedFromQueue = false;
            std::string pendingMatchId;
            {
                std::lock_guard<std::mutex> lock(arena_mtx);
                removedFromQueue = queuedPlayersByUserId.erase(userData->userId) > 0;
                auto pendingIt = pendingMatchByUserId.find(userData->userId);
                if (pendingIt != pendingMatchByUserId.end()) {
                    pendingMatchId = pendingIt->second;
                }
            }

            if (!pendingMatchId.empty()) {
                cancelPendingMatch(pendingMatchId, "cancelled", userData->userId);
            } else if (removedFromQueue) {
                ws->send(json({
                    {"event", "matchQueueCancelled"},
                    {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                }).dump(), uWS::OpCode::TEXT);
            }
        }
        else if (event == "acceptMatch") {
            if (!userData->authenticated || userData->userId <= 0 || !hasString(data, "matchId")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("acceptMatch", "invalid_payload", "acceptMatch requires authentication and string matchId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string matchId = static_cast<std::string>(data["matchId"]);
            bool shouldCreateMatch = false;
            PendingMatchInvitation invitation;
            {
                std::lock_guard<std::mutex> lock(arena_mtx);
                auto invitationIt = pendingMatches.find(matchId);
                if (invitationIt == pendingMatches.end() || !pendingMatchByUserId.count(userData->userId) || pendingMatchByUserId[userData->userId] != matchId) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("acceptMatch", "match_not_found", "Pending match invitation was not found", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }

                invitationIt->second.acceptedByUserId[userData->userId] = true;
                invitation = invitationIt->second;
                shouldCreateMatch = true;
                for (long long invitationUserId : invitation.userIds) {
                    if (!invitation.acceptedByUserId.count(invitationUserId) || !invitation.acceptedByUserId.at(invitationUserId)) {
                        shouldCreateMatch = false;
                        break;
                    }
                }
            }

            ws->send(json({
                {"event", "matchAccepted"},
                {"matchId", matchId},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump(), uWS::OpCode::TEXT);

            if (shouldCreateMatch) {
                createActiveMatchFromInvitation(invitation);
            }
        }
        else if (event == "declineMatch") {
            if (!userData->authenticated || userData->userId <= 0 || !hasString(data, "matchId")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("declineMatch", "invalid_payload", "declineMatch requires authentication and string matchId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string matchId = static_cast<std::string>(data["matchId"]);
            cancelPendingMatch(matchId, "declined", userData->userId);
        }
        else if (event == "arenaMessageSend") {
            if (!userData->authenticated || userData->userId <= 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("arenaMessageSend", "not_authenticated", "Client must authenticate before sending arena messages", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("arenaMessageSend", "not_joined", "Client must join the arena before sending arena messages", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "body")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("arenaMessageSend", "invalid_payload", "arenaMessageSend requires string body", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::string body = trimCopy(data["body"]);
            if (body.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("arenaMessageSend", "chat_empty_message", "Arena chat body is required", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (body.size() > 400) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("arenaMessageSend", "chat_message_too_long", "Arena chat message exceeds the maximum length", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            auto sendArenaSystemToSelf = [&](const std::string& systemBody, const std::string& type = "system") {
                ws->send(json({
                    {"event", "arenaSystemMessage"},
                    {"message", {
                        {"type", type},
                        {"body", systemBody},
                        {"createdAt", static_cast<long long>(std::time(nullptr)) * 1000}
                    }},
                    {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                }).dump(), uWS::OpCode::TEXT);
            };

            if (body.rfind("/add ", 0) == 0) {
                const std::string targetToken = trimCopy(body.substr(5));
                std::string targetNickname;
                std::string targetTag;
                if (!parseNicknameAndTagToken(targetToken, &targetNickname, &targetTag)) {
                    sendArenaSystemToSelf("Use /add Nickname#TAG to send a friend request.", "error");
                    return;
                }

                std::string repositoryError;
                std::optional<UserRecord> targetUser = userRepository.findByNicknameAndTag(targetNickname, targetTag, &repositoryError);
                if (!targetUser.has_value()) {
                    sendArenaSystemToSelf(repositoryError.empty() ? "Player not found for /add." : repositoryError, "error");
                    return;
                }
                if (targetUser->id == userData->userId) {
                    sendArenaSystemToSelf("You cannot add yourself.", "error");
                    return;
                }

                std::optional<FriendshipLinkRecord> existingLink = friendshipRepository.findExistingLink(userData->userId, targetUser->id, &repositoryError);
                if (!repositoryError.empty()) {
                    sendArenaSystemToSelf(repositoryError, "error");
                    return;
                }

                std::vector<long long> affectedUsers = {userData->userId, targetUser->id};
                if (existingLink.has_value()) {
                    if (existingLink->status == "accepted") {
                        sendArenaSystemToSelf("This player is already on your friend list.", "error");
                        return;
                    }

                    if (existingLink->status == "pending") {
                        if (existingLink->requesterId == userData->userId) {
                            sendArenaSystemToSelf("A friend request is already pending for this player.", "error");
                            return;
                        }

                        FriendshipLinkRecord acceptedLink;
                        if (!friendshipRepository.updateRequestStatus(existingLink->id, "accepted", &acceptedLink, &repositoryError)) {
                            sendArenaSystemToSelf(repositoryError, "error");
                            return;
                        }

                        sendFriendsSyncToUsers(affectedUsers);
                        sendPrivateChatsSyncToUsers(affectedUsers);
                        sendArenaSystemToSelf("Friend request accepted. You are now friends.");
                        return;
                    }
                }

                FriendshipLinkRecord newLink;
                if (!friendshipRepository.createPendingRequest(userData->userId, targetUser->id, &newLink, &repositoryError)) {
                    sendArenaSystemToSelf(repositoryError, "error");
                    return;
                }

                sendFriendsSyncToUsers(affectedUsers);
                sendPrivateChatsSyncToUsers(affectedUsers);
                sendArenaSystemToSelf("Friend request sent.");
                return;
            }

            auto sendPrivateWhisper = [&](long long targetUserId, const std::string& targetNickname, const std::string& targetTag, const std::string& whisperBody) {
                std::string repositoryError;
                std::optional<FriendshipLinkRecord> acceptedLink = friendshipRepository.findAcceptedLink(
                    userData->userId,
                    targetUserId,
                    &repositoryError
                );
                if (!acceptedLink.has_value()) {
                    sendArenaSystemToSelf(repositoryError.empty() ? "Private messages are only available between friends." : repositoryError, "error");
                    return;
                }

                PrivateMessageRecord messageRecord;
                if (!privateChatRepository.createMessage(userData->userId, targetUserId, whisperBody, &messageRecord, &repositoryError)) {
                    sendArenaSystemToSelf(repositoryError, "error");
                    return;
                }

                json incomingPayload = {
                    {"event", "privateMessageReceived"},
                    {"friendUserId", userData->userId},
                    {"nickname", userData->nickname},
                    {"tag", userData->tag},
                    {"message", {
                        {"id", messageRecord.id},
                        {"direction", "in"},
                        {"body", messageRecord.body},
                        {"createdAt", messageRecord.createdAtMs},
                        {"read", false}
                    }},
                    {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                };
                sendPrivateMessageToUser(targetUserId, incomingPayload, true);

                ws->send(json({
                    {"event", "privateMessageSent"},
                    {"friendUserId", targetUserId},
                    {"message", {
                        {"id", messageRecord.id},
                        {"direction", "out"},
                        {"body", messageRecord.body},
                        {"createdAt", messageRecord.createdAtMs},
                        {"read", false}
                    }},
                    {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                }).dump(), uWS::OpCode::TEXT);

                ws->send(json({
                    {"event", "arenaWhisper"},
                    {"message", {
                        {"id", messageRecord.id},
                        {"type", "whisper_out"},
                        {"senderUserId", userData->userId},
                        {"senderNickname", userData->nickname},
                        {"senderTag", userData->tag},
                        {"targetUserId", targetUserId},
                        {"targetLabel", targetNickname + targetTag},
                        {"body", messageRecord.body},
                        {"createdAt", messageRecord.createdAtMs}
                    }},
                    {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                }).dump(), uWS::OpCode::TEXT);

                sendPrivateChatsSyncToUsers({userData->userId, targetUserId});
            };

            if (body.rfind("/w ", 0) == 0) {
                const std::vector<std::string> parts = splitBySpace(body);
                if (parts.size() < 3) {
                    sendArenaSystemToSelf("Use /w Nickname#TAG message to send a private message.", "error");
                    return;
                }

                std::string targetNickname;
                std::string targetTag;
                if (!parseNicknameAndTagToken(parts[1], &targetNickname, &targetTag)) {
                    sendArenaSystemToSelf("Use /w Nickname#TAG message to send a private message.", "error");
                    return;
                }

                std::string repositoryError;
                std::optional<UserRecord> targetUser = userRepository.findByNicknameAndTag(targetNickname, targetTag, &repositoryError);
                if (!targetUser.has_value()) {
                    sendArenaSystemToSelf(repositoryError.empty() ? "Whisper target not found." : repositoryError, "error");
                    return;
                }

                std::string whisperBody = trimCopy(body.substr(body.find(parts[1]) + parts[1].size()));
                if (whisperBody.empty()) {
                    sendArenaSystemToSelf("Whisper body is required.", "error");
                    return;
                }

                sendPrivateWhisper(targetUser->id, targetUser->nickname, targetUser->tag, whisperBody);
                return;
            }

            if (body.rfind("/r", 0) == 0) {
                if (userData->lastWhisperFromUserId <= 0 || userData->lastWhisperFromDisplay.empty()) {
                    sendArenaSystemToSelf("You have no recent private message to reply to.", "error");
                    return;
                }

                std::string replyBody = trimCopy(body.substr(2));
                if (replyBody.rfind(userData->lastWhisperFromDisplay, 0) == 0) {
                    replyBody = trimCopy(replyBody.substr(userData->lastWhisperFromDisplay.size()));
                }
                if (replyBody.empty()) {
                    sendArenaSystemToSelf("Reply message is required.", "error");
                    return;
                }

                std::string repositoryError;
                std::optional<UserRecord> targetUser = userRepository.findById(userData->lastWhisperFromUserId, &repositoryError);
                if (!targetUser.has_value()) {
                    sendArenaSystemToSelf(repositoryError.empty() ? "Reply target not found." : repositoryError, "error");
                    return;
                }

                sendPrivateWhisper(targetUser->id, targetUser->nickname, targetUser->tag, replyBody);
                return;
            }

            ArenaMessageRecord arenaMessage;
            std::string repositoryError;
            if (!arenaChatRepository.createMessage(
                userData->currentInstanceKey,
                userData->userId,
                userData->nickname,
                userData->tag,
                "public",
                body,
                std::nullopt,
                &arenaMessage,
                &repositoryError
            )) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("arenaMessageSend", "database_error", repositoryError, world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            broadcastToInstance(userData->currentInstanceKey, json({
                {"event", "arenaMessage"},
                {"message", {
                    {"id", arenaMessage.id},
                    {"type", "public"},
                    {"senderUserId", arenaMessage.senderUserId},
                    {"senderNickname", arenaMessage.senderNickname},
                    {"senderTag", arenaMessage.senderTag},
                    {"body", arenaMessage.body},
                    {"createdAt", arenaMessage.createdAtMs}
                }},
                {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
            }).dump());
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
            const std::string mode = hasString(data, "mode") ? static_cast<std::string>(data["mode"]) : "training";
            const std::string matchId = hasString(data, "matchId") ? static_cast<std::string>(data["matchId"]) : "";
            if (mode != "training" && mode != "match") {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("join", "invalid_mode", "join mode must be training or match", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            if (!joinArenaInstance(ws, userData, data["characterId"], mode, matchId)) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("join", "join_rejected", "Arena join request was rejected for the current mode or match state", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
            }
        } 
        else if (event == "move") {
            GameWorld* arenaWorld = getCurrentArenaWorld();
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "not_joined", "Client must join before sending move", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (isCurrentMatchFinished()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "match_finished", "Match has already finished", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (arenaWorld == nullptr) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "missing_instance", "Arena instance is not available", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasNumber(data, "inputX") || !hasNumber(data, "inputY") || !hasString(data, "direction") || !data.contains("animRow") || !data["animRow"].is_number_integer()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "invalid_payload", "move requires numeric inputX/inputY, string direction and integer animRow", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!arenaWorld->movePlayer(userData->id, data["inputX"], data["inputY"], data["direction"], data["animRow"])) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("move", "move_rejected", "Move intent was not accepted for the current player state", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
            }
        }
        else if (event == "shoot") {
            GameWorld* arenaWorld = getCurrentArenaWorld();
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("shoot", "not_joined", "Client must join before shooting", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (isCurrentMatchFinished()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("shoot", "match_finished", "Match has already finished", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (arenaWorld == nullptr) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("shoot", "missing_instance", "Arena instance is not available", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasNumber(data, "targetX") || !hasNumber(data, "targetY")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("shoot", "invalid_payload", "shoot requires numeric targetX and targetY", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            const std::string previousInstance = pushBroadcastContext(userData->currentInstanceKey);
            const bool accepted = arenaWorld->requestAutoAttack(userData->id, data["targetX"], data["targetY"], this);
            popBroadcastContext(previousInstance);
            if (!accepted) {
                sendTo(userData->id, json({
                    {"event", "autoAttackRejected"},
                    {"code", "cooldown_or_state"},
                    {"reason", "Auto attack was rejected due to cooldown or player state"},
                    {"tick", arenaWorld->getCurrentTick()}
                }).dump());
            }
        }
        else if (event == "respawn") {
            GameWorld* arenaWorld = getCurrentArenaWorld();
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respawn", "not_joined", "Client must join before respawning", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (isCurrentMatchFinished()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respawn", "match_finished", "Match has already finished", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (arenaWorld == nullptr) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("respawn", "missing_instance", "Arena instance is not available", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (arenaWorld->respawnPlayer(userData->id)) {
                json p = arenaWorld->getPlayerJson(userData->id);
                broadcastToInstance(userData->currentInstanceKey, json({{"event", "playerRespawned"}, {"tick", arenaWorld->getCurrentTick()}, {"id", userData->id}, {"hp", p["hp"]}, {"x", p["x"]}, {"y", p["y"]}}).dump());
            } else {
                sendTo(userData->id, ProtocolPayloadBuilder::buildActionRejected("respawn", "respawn_locked", "Player cannot respawn yet", world.getCurrentTick()).dump());
            }
        }
        else if (event == "changeCharacter") {
            GameWorld* arenaWorld = getCurrentArenaWorld();
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "not_joined", "Client must join before changing character", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (arenaWorld == nullptr) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "missing_instance", "Arena instance is not available", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "characterId")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "invalid_payload", "changeCharacter requires string characterId", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            const std::optional<Player> currentPlayer = arenaWorld->getPlayerCopy(userData->id);
            if (!currentPlayer.has_value()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "player_not_found", "Player was not found in the current arena instance", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (currentPlayer->hp > 0) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "player_not_dead", "Character can only be changed while dead", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }

            try {
                const std::string characterId = static_cast<std::string>(data["characterId"]);
                if (!arenaWorld->changePlayerCharacter(userData->id, characterId)) {
                    ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "change_rejected", "Character change was not accepted for the current player state", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                    return;
                }

                sendTo(userData->id, json({
                    {"event", "characterChanged"},
                    {"characterId", characterId},
                    {"tick", arenaWorld->getCurrentTick()},
                    {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
                }).dump());
            } catch (const std::exception& exception) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("changeCharacter", "invalid_character", exception.what(), world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
            }
        }
        else if (event == "useSkill") {
            GameWorld* arenaWorld = getCurrentArenaWorld();
            if (userData->id.empty()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("useSkill", "not_joined", "Client must join before using skills", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (isCurrentMatchFinished()) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("useSkill", "match_finished", "Match has already finished", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (arenaWorld == nullptr) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("useSkill", "missing_instance", "Arena instance is not available", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            if (!hasString(data, "skillId") || !hasNumber(data, "x") || !hasNumber(data, "y")) {
                ws->send(ProtocolPayloadBuilder::buildActionRejected("useSkill", "invalid_payload", "useSkill requires string skillId and numeric x/y", world.getCurrentTick()).dump(), uWS::OpCode::TEXT);
                return;
            }
            const std::string previousInstance = pushBroadcastContext(userData->currentInstanceKey);
            const bool accepted = arenaWorld->useSkill(userData->id, data["skillId"], data["x"], data["y"], this);
            popBroadcastContext(previousInstance);
            if (!accepted) {
                sendTo(userData->id, json({
                    {"event", "skillRejected"},
                    {"skillId", data["skillId"]},
                    {"code", "cooldown_or_state"},
                    {"reason", "Skill request was rejected due to cooldown, invalid skill or player state"},
                    {"tick", arenaWorld->getCurrentTick()}
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
    long long closedUserId = userData ? userData->userId : 0;
    std::string pendingMatchId;
    if (userData != nullptr && closedUserId > 0) {
        std::lock_guard<std::mutex> lock(arena_mtx);
        queuedPlayersByUserId.erase(closedUserId);
        auto pendingIt = pendingMatchByUserId.find(closedUserId);
        if (pendingIt != pendingMatchByUserId.end()) {
            pendingMatchId = pendingIt->second;
        }
    }
    unregisterAuthenticatedSocket(ws, userData);
    if (!pendingMatchId.empty()) {
        cancelPendingMatch(pendingMatchId, "cancelled", closedUserId);
    }
    if (userData && !userData->id.empty()) {
        removeFromArenaInstance(ws, userData);
    }
    if (closedUserId > 0) {
        notifyFriendsPresenceChanged(closedUserId);
    }
}
