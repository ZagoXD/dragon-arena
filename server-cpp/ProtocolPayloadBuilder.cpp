#include "ProtocolPayloadBuilder.h"
#include "ProtocolConfig.h"
#include "WorldSnapshotBuilder.h"

json ProtocolPayloadBuilder::buildCapabilities() {
    return {
        {"authoritativeGameplay", true},
        {"authoritativeProjectiles", true},
        {"tickSnapshots", true},
        {"actionRejectionCodes", true}
    };
}

json ProtocolPayloadBuilder::buildCharactersJson() {
    json charactersJson = json::object();
    for (const auto& [id, definition] : GameConfig::getCharacterDefinitions()) {
        charactersJson[id] = GameConfig::to_json(definition);
    }
    return charactersJson;
}

json ProtocolPayloadBuilder::buildSpellsJson() {
    json spellsJson = json::object();
    for (const auto& [id, definition] : GameConfig::getSpellDefinitions()) {
        spellsJson[id] = GameConfig::to_json(definition);
    }
    return spellsJson;
}

json ProtocolPayloadBuilder::buildPassivesJson() {
    json passivesJson = json::object();
    for (const auto& [id, definition] : GameConfig::getPassiveDefinitions()) {
        passivesJson[id] = GameConfig::to_json(definition);
    }
    return passivesJson;
}

json ProtocolPayloadBuilder::buildBootstrap(
    const WorldDefinition& worldDefinition,
    const std::map<std::string, Player>& players,
    const std::string& playerId
) {
    json bootstrap = {
        {"contentHash", GameConfig::getContentHash()},
        {"world", GameConfig::to_json(worldDefinition)},
        {"characters", buildCharactersJson()},
        {"spells", buildSpellsJson()},
        {"passives", buildPassivesJson()}
    };

    auto it = players.find(playerId);
    if (it != players.end()) {
        bootstrap["characterId"] = it->second.characterId;
        bootstrap["player"] = it->second.to_json();
    }

    return bootstrap;
}

json ProtocolPayloadBuilder::buildSessionInit(
    unsigned long long worldTick,
    long long serverTimeMs,
    const WorldDefinition& worldDefinition,
    const std::map<std::string, Player>& players,
    const std::map<std::string, DummyEntity>& dummies,
    const std::vector<ActiveProjectile>& activeProjectiles,
    const std::vector<ActiveBurnStatus>& activeBurnStatuses,
    const std::vector<BurnZone>& burnZones,
    const json& map,
    const std::string& playerId
) {
    return {
        {"event", "sessionInit"},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION},
        {"serverTimeMs", serverTimeMs},
        {"capabilities", buildCapabilities()},
        {"selfId", playerId},
        {"bootstrap", buildBootstrap(worldDefinition, players, playerId)},
        {"map", map},
        {"snapshot", WorldSnapshotBuilder::buildWorldState(worldTick, players, dummies, activeProjectiles, activeBurnStatuses, burnZones)}
    };
}

json ProtocolPayloadBuilder::buildActionRejected(
    const std::string& requestEvent,
    const std::string& code,
    const std::string& reason,
    unsigned long long tick,
    const json& extras
) {
    json payload = {
        {"event", "actionRejected"},
        {"requestEvent", requestEvent},
        {"code", code},
        {"reason", reason},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION},
        {"tick", tick}
    };

    for (auto it = extras.begin(); it != extras.end(); ++it) {
        payload[it.key()] = it.value();
    }

    return payload;
}

json ProtocolPayloadBuilder::buildProtocolError(const std::string& code, const std::string& reason) {
    return {
        {"event", "protocolError"},
        {"code", code},
        {"reason", reason},
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION}
    };
}
