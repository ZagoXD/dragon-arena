#include "ServerDiagnostics.h"
#include "GameConfig.h"
#include "ProtocolConfig.h"
#include <cstdlib>
#include <iostream>
#include <sstream>

namespace {
bool readFlag(const char* name) {
    const char* value = std::getenv(name);
    return value != nullptr && std::string(value) != "0" && std::string(value) != "false";
}

const RuntimeDebugOptions& getOptions() {
    static const RuntimeDebugOptions options = {
        readFlag("DRAGON_ARENA_LOG_PROTOCOL"),
        readFlag("DRAGON_ARENA_LOG_TICKS"),
        readFlag("DRAGON_ARENA_LOG_COMBAT")
    };
    return options;
}

void logIfEnabled(bool enabled, const std::string& channel, const std::string& name, const json& payload) {
    if (!enabled) {
        return;
    }

    std::cout << "[" << channel << "] " << json({
        {"event", name},
        {"payload", payload}
    }).dump() << std::endl;
}
}

json ServerDiagnostics::buildStartupSummary(const GameWorld& world) {
    const RuntimeDebugOptions options = getRuntimeDebugOptions();

    return {
        {"protocolVersion", DRAGON_ARENA_PROTOCOL_VERSION},
        {"tickIntervalMs", DRAGON_ARENA_TICK_INTERVAL_MS},
        {"snapshotIntervalMs", DRAGON_ARENA_SNAPSHOT_INTERVAL_MS},
        {"content", GameConfig::buildContentSummary()},
        {"runtimeLogs", {
            {"protocol", options.protocolLogs},
            {"ticks", options.tickLogs},
            {"combat", options.combatLogs}
        }},
        {"world", {
            {"currentTick", world.getCurrentTick()},
            {"mapLoaded", world.getMapLoader().isLoaded()},
            {"mapWidth", world.getMapLoader().getWidthPixels()},
            {"mapHeight", world.getMapLoader().getHeightPixels()},
            {"tileSize", world.getMapLoader().getWorldTileSize()}
        }}
    };
}

std::string ServerDiagnostics::buildStartupSummaryText(const GameWorld& world) {
    const RuntimeDebugOptions options = getRuntimeDebugOptions();
    const json content = GameConfig::buildContentSummary();

    std::ostringstream stream;
    stream
        << "Dragon Arena server booted\n"
        << "  Protocol: v" << DRAGON_ARENA_PROTOCOL_VERSION << "\n"
        << "  Tick: " << DRAGON_ARENA_TICK_INTERVAL_MS << " ms\n"
        << "  Snapshot: " << DRAGON_ARENA_SNAPSHOT_INTERVAL_MS << " ms\n"
        << "  Config: " << GameConfig::getLoadedConfigPath() << "\n"
        << "  Content hash: " << GameConfig::getContentHash() << "\n"
        << "  Characters (" << content["characters"]["count"] << "): " << content["characters"]["ids"].dump() << "\n"
        << "  Spells (" << content["spells"]["count"] << "): " << content["spells"]["ids"].dump() << "\n"
        << "  World config: " << content["world"]["mapWidth"] << "x" << content["world"]["mapHeight"]
        << ", tile " << content["world"]["tileSize"] << "\n"
        << "  Loaded map: " << (world.getMapLoader().isLoaded() ? "yes" : "no")
        << " (" << world.getMapLoader().getWidthPixels() << "x" << world.getMapLoader().getHeightPixels()
        << ", tile " << world.getMapLoader().getWorldTileSize() << ")\n"
        << "  Runtime logs: protocol=" << (options.protocolLogs ? "on" : "off")
        << ", ticks=" << (options.tickLogs ? "on" : "off")
        << ", combat=" << (options.combatLogs ? "on" : "off");

    return stream.str();
}

RuntimeDebugOptions ServerDiagnostics::getRuntimeDebugOptions() {
    return getOptions();
}

void ServerDiagnostics::logProtocolEvent(const std::string& name, const json& payload) {
    logIfEnabled(getOptions().protocolLogs, "Protocol", name, payload);
}

void ServerDiagnostics::logTickEvent(const std::string& name, const json& payload) {
    logIfEnabled(getOptions().tickLogs, "Tick", name, payload);
}

void ServerDiagnostics::logCombatEvent(const std::string& name, const json& payload) {
    logIfEnabled(getOptions().combatLogs, "Combat", name, payload);
}
