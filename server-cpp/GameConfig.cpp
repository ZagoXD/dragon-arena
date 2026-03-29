#include "GameConfig.h"
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace {
struct LoadedGameplayConfig {
    std::map<std::string, SpellDefinition> spells;
    std::map<std::string, CharacterDefinition> characters;
    WorldDefinition world{};
    std::string sourcePath;
    std::string contentHash;
};

SpellDefinition parseSpellDefinition(const json& node) {
    return {
        node.at("id").get<std::string>(),
        node.at("name").get<std::string>(),
        node.at("damage").get<int>(),
        node.at("range").get<float>(),
        node.at("castTimeMs").get<int>(),
        node.at("cooldownMs").get<int>(),
        node.value("projectileSpeed", 0.0f),
        node.value("projectileRadius", 0.0f),
        node.value("effectDurationMs", 0)
    };
}

CharacterDefinition parseCharacterDefinition(const json& node) {
    return {
        node.at("id").get<std::string>(),
        node.at("name").get<std::string>(),
        node.at("maxHp").get<int>(),
        node.at("movementSpeed").get<float>(),
        node.at("colliderWidth").get<float>(),
        node.at("colliderHeight").get<float>(),
        node.at("autoAttackSpellId").get<std::string>(),
        node.at("skillIds").get<std::vector<std::string>>()
    };
}

WorldDefinition parseWorldDefinition(const json& node) {
    return {
        node.at("tileSize").get<int>(),
        node.at("mapWidth").get<int>(),
        node.at("mapHeight").get<int>(),
        node.at("dummyMaxHp").get<int>(),
        node.at("dummyRespawnMs").get<int>(),
        node.at("dummyColliderSize").get<int>(),
        node.at("playerRespawnMs").get<int>()
    };
}

void validateSpellDefinition(const SpellDefinition& spell) {
    if (spell.id.empty()) {
        throw std::runtime_error("SpellDefinition has empty id");
    }
    if (spell.name.empty()) {
        throw std::runtime_error("SpellDefinition '" + spell.id + "' has empty name");
    }
    if (spell.damage < 0) {
        throw std::runtime_error("SpellDefinition '" + spell.id + "' has negative damage");
    }
    if (spell.range < 0.0f) {
        throw std::runtime_error("SpellDefinition '" + spell.id + "' has negative range");
    }
    if (spell.castTimeMs < 0 || spell.cooldownMs < 0 || spell.effectDurationMs < 0) {
        throw std::runtime_error("SpellDefinition '" + spell.id + "' has negative timing values");
    }
    if (spell.projectileSpeed < 0.0f || spell.projectileRadius < 0.0f) {
        throw std::runtime_error("SpellDefinition '" + spell.id + "' has invalid projectile values");
    }
}

void validateCharacterDefinition(const CharacterDefinition& character, const std::map<std::string, SpellDefinition>& spells) {
    if (character.id.empty()) {
        throw std::runtime_error("CharacterDefinition has empty id");
    }
    if (character.name.empty()) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has empty name");
    }
    if (character.maxHp <= 0) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid maxHp");
    }
    if (character.movementSpeed <= 0.0f) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid movementSpeed");
    }
    if (character.colliderWidth <= 0.0f || character.colliderHeight <= 0.0f) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid collider");
    }
    if (!spells.count(character.autoAttackSpellId)) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' references unknown autoAttackSpellId '" + character.autoAttackSpellId + "'");
    }
    for (const auto& skillId : character.skillIds) {
        if (!spells.count(skillId)) {
            throw std::runtime_error("CharacterDefinition '" + character.id + "' references unknown skillId '" + skillId + "'");
        }
    }
}

void validateWorldDefinition(const WorldDefinition& world) {
    if (world.tileSize <= 0 || world.mapWidth <= 0 || world.mapHeight <= 0) {
        throw std::runtime_error("WorldDefinition has invalid dimensions");
    }
    if (world.dummyMaxHp <= 0 || world.dummyRespawnMs < 0 || world.dummyColliderSize <= 0 || world.playerRespawnMs < 0) {
        throw std::runtime_error("WorldDefinition has invalid gameplay values");
    }
}

std::string makeContentHash(const std::string& rawContent) {
    std::size_t hashValue = std::hash<std::string>{}(rawContent);
    std::ostringstream stream;
    stream << std::hex << std::setw(16) << std::setfill('0') << hashValue;
    return stream.str();
}

std::vector<std::filesystem::path> getCandidateConfigPaths() {
    std::vector<std::filesystem::path> candidates;

    if (const char* envPath = std::getenv("DRAGON_ARENA_GAMEPLAY_CONFIG")) {
        candidates.emplace_back(envPath);
    }

    const std::filesystem::path current = std::filesystem::current_path();
    candidates.push_back(current / "config" / "gameplay.json");
    candidates.push_back(current / "server-cpp" / "config" / "gameplay.json");

    std::filesystem::path cursor = current;
    for (int i = 0; i < 6; ++i) {
        candidates.push_back(cursor / "server-cpp" / "config" / "gameplay.json");
        candidates.push_back(cursor / "config" / "gameplay.json");
        if (!cursor.has_parent_path()) {
            break;
        }
        cursor = cursor.parent_path();
    }

    return candidates;
}

LoadedGameplayConfig loadGameplayConfig() {
    std::ifstream file;
    std::filesystem::path resolvedPath;

    for (const auto& candidate : getCandidateConfigPaths()) {
        file.open(candidate);
        if (file.is_open()) {
            resolvedPath = std::filesystem::weakly_canonical(candidate);
            break;
        }
        file.clear();
    }

    if (!file.is_open()) {
        throw std::runtime_error("Could not locate gameplay config file. Expected config/gameplay.json or server-cpp/config/gameplay.json");
    }

    std::stringstream buffer;
    buffer << file.rdbuf();
    const std::string rawConfig = buffer.str();
    const json document = json::parse(rawConfig);

    LoadedGameplayConfig loaded;
    loaded.sourcePath = resolvedPath.string();
    loaded.contentHash = makeContentHash(rawConfig);
    loaded.world = parseWorldDefinition(document.at("world"));

    for (const auto& node : document.at("spells")) {
        SpellDefinition spell = parseSpellDefinition(node);
        loaded.spells[spell.id] = spell;
    }

    for (const auto& node : document.at("characters")) {
        CharacterDefinition character = parseCharacterDefinition(node);
        loaded.characters[character.id] = character;
    }

    if (loaded.spells.empty()) {
        throw std::runtime_error("GameConfig has no spell definitions");
    }
    if (loaded.characters.empty()) {
        throw std::runtime_error("GameConfig has no character definitions");
    }

    for (const auto& [id, spell] : loaded.spells) {
        if (id != spell.id) {
            throw std::runtime_error("SpellDefinition key mismatch for '" + id + "'");
        }
        validateSpellDefinition(spell);
    }

    for (const auto& [id, character] : loaded.characters) {
        if (id != character.id) {
            throw std::runtime_error("CharacterDefinition key mismatch for '" + id + "'");
        }
        validateCharacterDefinition(character, loaded.spells);
    }

    validateWorldDefinition(loaded.world);
    return loaded;
}

const LoadedGameplayConfig& getLoadedGameplayConfig() {
    static const LoadedGameplayConfig config = loadGameplayConfig();
    return config;
}
}

const std::map<std::string, SpellDefinition>& GameConfig::getSpellDefinitions() {
    return getLoadedGameplayConfig().spells;
}

const std::map<std::string, CharacterDefinition>& GameConfig::getCharacterDefinitions() {
    return getLoadedGameplayConfig().characters;
}

const WorldDefinition& GameConfig::getWorldDefinition() {
    return getLoadedGameplayConfig().world;
}

const SpellDefinition& GameConfig::getSpellDefinition(const std::string& spellId) {
    const auto& definitions = getSpellDefinitions();
    auto it = definitions.find(spellId);
    if (it != definitions.end()) {
        return it->second;
    }

    throw std::runtime_error("Unknown spell definition: " + spellId);
}

const CharacterDefinition& GameConfig::getCharacterDefinition(const std::string& characterId) {
    const auto& definitions = getCharacterDefinitions();
    auto it = definitions.find(characterId);
    if (it != definitions.end()) {
        return it->second;
    }

    return definitions.at("charizard");
}

void GameConfig::validateDefinitions() {
    (void)getLoadedGameplayConfig();
}

json GameConfig::buildContentSummary() {
    json characterIds = json::array();
    for (const auto& [id, definition] : getCharacterDefinitions()) {
        characterIds.push_back(id);
    }

    json spellIds = json::array();
    for (const auto& [id, definition] : getSpellDefinitions()) {
        spellIds.push_back(id);
    }

    return {
        {"configPath", getLoadedConfigPath()},
        {"contentHash", getContentHash()},
        {"characters", {
            {"count", getCharacterDefinitions().size()},
            {"ids", characterIds}
        }},
        {"spells", {
            {"count", getSpellDefinitions().size()},
            {"ids", spellIds}
        }},
        {"world", to_json(getWorldDefinition())}
    };
}

std::string GameConfig::getLoadedConfigPath() {
    return getLoadedGameplayConfig().sourcePath;
}

std::string GameConfig::getContentHash() {
    return getLoadedGameplayConfig().contentHash;
}

json GameConfig::to_json(const SpellDefinition& spell) {
    return {
        {"id", spell.id},
        {"name", spell.name},
        {"damage", spell.damage},
        {"range", spell.range},
        {"castTimeMs", spell.castTimeMs},
        {"cooldownMs", spell.cooldownMs},
        {"projectileSpeed", spell.projectileSpeed},
        {"projectileRadius", spell.projectileRadius},
        {"effectDurationMs", spell.effectDurationMs}
    };
}

json GameConfig::to_json(const CharacterDefinition& character) {
    return {
        {"id", character.id},
        {"name", character.name},
        {"maxHp", character.maxHp},
        {"movementSpeed", character.movementSpeed},
        {"colliderWidth", character.colliderWidth},
        {"colliderHeight", character.colliderHeight},
        {"autoAttackSpellId", character.autoAttackSpellId},
        {"skillIds", character.skillIds}
    };
}

json GameConfig::to_json(const WorldDefinition& world) {
    return {
        {"tileSize", world.tileSize},
        {"mapWidth", world.mapWidth},
        {"mapHeight", world.mapHeight},
        {"dummyMaxHp", world.dummyMaxHp},
        {"dummyRespawnMs", world.dummyRespawnMs},
        {"dummyColliderSize", world.dummyColliderSize},
        {"playerRespawnMs", world.playerRespawnMs}
    };
}
