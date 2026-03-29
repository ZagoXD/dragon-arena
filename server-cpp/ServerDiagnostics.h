#ifndef SERVER_DIAGNOSTICS_H
#define SERVER_DIAGNOSTICS_H

#include <nlohmann/json.hpp>
#include "GameWorld.h"

using json = nlohmann::json;

struct RuntimeDebugOptions {
    bool protocolLogs = false;
    bool tickLogs = false;
    bool combatLogs = false;
};

class ServerDiagnostics {
public:
    static json buildStartupSummary(const GameWorld& world);
    static std::string buildStartupSummaryText(const GameWorld& world);
    static RuntimeDebugOptions getRuntimeDebugOptions();
    static void logProtocolEvent(const std::string& name, const json& payload = json::object());
    static void logTickEvent(const std::string& name, const json& payload = json::object());
    static void logCombatEvent(const std::string& name, const json& payload = json::object());
};

#endif
