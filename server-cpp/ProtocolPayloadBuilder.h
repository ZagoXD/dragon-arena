#ifndef PROTOCOL_PAYLOAD_BUILDER_H
#define PROTOCOL_PAYLOAD_BUILDER_H

#include <map>
#include <unordered_map>
#include <string>
#include "GameConfig.h"
#include "GameState.h"
#include "MapLoader.h"
#include "Player.h"
#include "auth/AuthService.h"

class ProtocolPayloadBuilder {
public:
    static json buildCapabilities();
    static json buildCharactersJson();
    static json buildSpellsJson();
    static json buildPassivesJson();
    static json buildGameplayContent();
    static json buildBootstrap(
        const WorldDefinition& worldDefinition,
        const std::map<std::string, Player>& players,
        const std::string& playerId
    );
    static json buildSessionInit(
        unsigned long long worldTick,
        long long serverTimeMs,
        const WorldDefinition& worldDefinition,
        const std::map<std::string, Player>& players,
        const std::map<std::string, DummyEntity>& dummies,
        const std::vector<ActiveProjectile>& activeProjectiles,
        const std::vector<ActiveAreaEffect>& activeAreaEffects,
        const std::vector<ActiveBurnStatus>& activeBurnStatuses,
        const std::vector<BurnZone>& burnZones,
        const json& map,
        const std::string& playerId,
        const MapLoader* mapLoader = nullptr,
        const std::unordered_map<std::string, long long>* revealedUntilByPlayerId = nullptr
    );
    static json buildActionRejected(
        const std::string& requestEvent,
        const std::string& code,
        const std::string& reason,
        unsigned long long tick,
        const json& extras = json::object()
    );
    static json buildProtocolError(
        const std::string& code,
        const std::string& reason
    );
    static json buildAuthSuccess(
        const std::string& mode,
        const AuthenticatedUser& authenticatedUser,
        const std::string& sessionToken,
        long long sessionExpiresAtMs
    );
    static json buildProfileSync(
        const AuthenticatedUser& authenticatedUser
    );
    static json buildAuthError(
        const std::string& code,
        const std::string& reason,
        const json& extras = json::object()
    );
};

#endif
