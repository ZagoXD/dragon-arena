#ifndef PROTOCOL_PAYLOAD_BUILDER_H
#define PROTOCOL_PAYLOAD_BUILDER_H

#include <map>
#include <string>
#include "GameConfig.h"
#include "GameState.h"
#include "Player.h"

class ProtocolPayloadBuilder {
public:
    static json buildCapabilities();
    static json buildCharactersJson();
    static json buildSpellsJson();
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
        const json& map,
        const std::string& playerId
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
};

#endif
