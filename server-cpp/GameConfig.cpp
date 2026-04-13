#include "GameConfig.h"
#include <cstdlib>
#include <algorithm>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace {
struct LoadedGameplayConfig {
    std::map<std::string, SpellDefinition> spells;
    std::map<std::string, PassiveDefinition> passives;
    std::map<std::string, CharacterDefinition> characters;
    WorldDefinition world{};
    std::string sourcePath;
    std::string contentHash;
};

json readJsonFile(const std::filesystem::path& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("Could not open config file: " + path.string());
    }

    json document;
    file >> document;
    return document;
}

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
    CharacterDefinition::PresentationDefinition presentation;
    if (node.contains("presentation") && node["presentation"].is_object()) {
        const json& presentationNode = node["presentation"];
        presentation.image = presentationNode.value("image", "");
        presentation.frameWidth = presentationNode.value("frameWidth", 0);
        presentation.frameHeight = presentationNode.value("frameHeight", 0);
        presentation.renderScale = presentationNode.value("renderScale", 1.0f);
        presentation.directions = presentationNode.value("directions", std::vector<std::string>{});

        if (presentationNode.contains("animations") && presentationNode["animations"].is_object()) {
            for (const auto& [animationId, animationNode] : presentationNode["animations"].items()) {
                CharacterDefinition::AnimationClipDefinition clip;
                clip.fps = animationNode.value("fps", 0);
                clip.loop = animationNode.value("loop", true);

                for (const auto& direction : presentation.directions) {
                    if (animationNode.contains(direction) && animationNode[direction].is_array()) {
                        clip.directions[direction] = animationNode[direction].get<std::vector<int>>();
                    }
                }

                presentation.animations[animationId] = std::move(clip);
            }
        }
    }

    return {
        node.at("id").get<std::string>(),
        node.at("name").get<std::string>(),
        node.value("description", ""),
        node.value("descriptionKey", ""),
        node.at("maxHp").get<int>(),
        node.at("movementSpeed").get<float>(),
        node.value("damageMultiplier", 1.0f),
        node.at("colliderWidth").get<float>(),
        node.at("colliderHeight").get<float>(),
        node.at("autoAttackSpellId").get<std::string>(),
        node.at("skillIds").get<std::vector<std::string>>(),
        node.at("passiveId").get<std::string>(),
        std::move(presentation)
    };
}

PassiveDefinition parsePassiveDefinition(const json& node) {
    return {
        node.at("id").get<std::string>(),
        node.at("name").get<std::string>(),
        node.at("durationMs").get<int>(),
        node.at("tickDamage").get<int>(),
        node.at("tickIntervalMs").get<int>(),
        node.value("movementSlowPct", 0.0f),
        node.value("applicationChances", std::map<std::string, float>{})
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

void validatePassiveDefinition(const PassiveDefinition& passive) {
    if (passive.id.empty()) {
        throw std::runtime_error("PassiveDefinition has empty id");
    }
    if (passive.name.empty()) {
        throw std::runtime_error("PassiveDefinition '" + passive.id + "' has empty name");
    }
    if (passive.durationMs <= 0 || passive.tickDamage < 0 || passive.tickIntervalMs <= 0) {
        throw std::runtime_error("PassiveDefinition '" + passive.id + "' has invalid timing or damage values");
    }
    if (passive.movementSlowPct < 0.0f || passive.movementSlowPct >= 1.0f) {
        throw std::runtime_error("PassiveDefinition '" + passive.id + "' has invalid movementSlowPct");
    }
}

void validateCharacterDefinition(
    const CharacterDefinition& character,
    const std::map<std::string, SpellDefinition>& spells,
    const std::map<std::string, PassiveDefinition>& passives
) {
    if (character.id.empty()) {
        throw std::runtime_error("CharacterDefinition has empty id");
    }
    if (character.name.empty()) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has empty name");
    }
    if (character.description.empty()) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has empty description");
    }
    if (character.descriptionKey.empty()) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has empty descriptionKey");
    }
    if (character.maxHp <= 0) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid maxHp");
    }
    if (character.movementSpeed <= 0.0f) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid movementSpeed");
    }
    if (character.damageMultiplier <= 0.0f) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid damageMultiplier");
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
    if (!passives.count(character.passiveId)) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' references unknown passiveId '" + character.passiveId + "'");
    }
    if (character.presentation.image.empty()) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has empty presentation.image");
    }
    if (character.presentation.frameWidth <= 0 || character.presentation.frameHeight <= 0) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid presentation frame size");
    }
    if (character.presentation.renderScale <= 0.0f) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has invalid presentation.renderScale");
    }
    if (character.presentation.directions.empty()) {
        throw std::runtime_error("CharacterDefinition '" + character.id + "' has no presentation directions");
    }
    for (const auto& requiredAnimationId : {"idle", "walk"}) {
        auto animationIt = character.presentation.animations.find(requiredAnimationId);
        if (animationIt == character.presentation.animations.end()) {
            throw std::runtime_error("CharacterDefinition '" + character.id + "' is missing presentation animation '" + requiredAnimationId + "'");
        }

        if (animationIt->second.fps <= 0) {
            throw std::runtime_error("CharacterDefinition '" + character.id + "' animation '" + requiredAnimationId + "' has invalid fps");
        }

        for (const auto& direction : character.presentation.directions) {
            auto directionIt = animationIt->second.directions.find(direction);
            if (directionIt == animationIt->second.directions.end() || directionIt->second.empty()) {
                throw std::runtime_error(
                    "CharacterDefinition '" + character.id + "' animation '" + requiredAnimationId +
                    "' is missing frames for direction '" + direction + "'"
                );
            }
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

std::vector<std::filesystem::path> getCandidateConfigRoots() {
    std::vector<std::filesystem::path> candidates;

    if (const char* envPath = std::getenv("DRAGON_ARENA_GAMEPLAY_CONFIG")) {
        candidates.emplace_back(envPath);
    }
    if (const char* envDir = std::getenv("DRAGON_ARENA_GAMEPLAY_CONFIG_DIR")) {
        candidates.emplace_back(envDir);
    }

    const std::filesystem::path current = std::filesystem::current_path();
    candidates.push_back(current / "config");
    candidates.push_back(current / "server-cpp" / "config");

    std::filesystem::path cursor = current;
    for (int i = 0; i < 6; ++i) {
        candidates.push_back(cursor / "server-cpp" / "config");
        candidates.push_back(cursor / "config");
        if (!cursor.has_parent_path()) {
            break;
        }
        cursor = cursor.parent_path();
    }

    return candidates;
}

bool isSplitConfigRoot(const std::filesystem::path& root) {
    return std::filesystem::exists(root / "world.json")
        && std::filesystem::exists(root / "spells")
        && std::filesystem::exists(root / "passives")
        && std::filesystem::exists(root / "characters");
}

std::string buildDirectoryContentHash(const std::vector<std::filesystem::path>& files) {
    std::ostringstream raw;

    for (const auto& path : files) {
        raw << path.generic_string() << '\n';
        std::ifstream file(path);
        raw << file.rdbuf() << '\n';
    }

    return makeContentHash(raw.str());
}

LoadedGameplayConfig loadSplitGameplayConfig(const std::filesystem::path& configRoot) {
    LoadedGameplayConfig loaded;
    loaded.sourcePath = std::filesystem::weakly_canonical(configRoot).string();
    loaded.world = parseWorldDefinition(readJsonFile(configRoot / "world.json"));

    std::vector<std::filesystem::path> contentFiles = {
        std::filesystem::weakly_canonical(configRoot / "world.json")
    };

    std::vector<std::filesystem::path> spellFiles;
    for (const auto& entry : std::filesystem::directory_iterator(configRoot / "spells")) {
        if (entry.is_regular_file() && entry.path().extension() == ".json") {
            spellFiles.push_back(std::filesystem::weakly_canonical(entry.path()));
        }
    }
    std::sort(spellFiles.begin(), spellFiles.end());

    for (const auto& spellFile : spellFiles) {
        SpellDefinition spell = parseSpellDefinition(readJsonFile(spellFile));
        loaded.spells[spell.id] = spell;
        contentFiles.push_back(spellFile);
    }

    std::vector<std::filesystem::path> passiveFiles;
    for (const auto& entry : std::filesystem::directory_iterator(configRoot / "passives")) {
        if (entry.is_regular_file() && entry.path().extension() == ".json") {
            passiveFiles.push_back(std::filesystem::weakly_canonical(entry.path()));
        }
    }
    std::sort(passiveFiles.begin(), passiveFiles.end());

    for (const auto& passiveFile : passiveFiles) {
        PassiveDefinition passive = parsePassiveDefinition(readJsonFile(passiveFile));
        loaded.passives[passive.id] = passive;
        contentFiles.push_back(passiveFile);
    }

    std::vector<std::filesystem::path> characterFiles;
    for (const auto& entry : std::filesystem::directory_iterator(configRoot / "characters")) {
        if (entry.is_regular_file() && entry.path().extension() == ".json") {
            characterFiles.push_back(std::filesystem::weakly_canonical(entry.path()));
        }
    }
    std::sort(characterFiles.begin(), characterFiles.end());

    for (const auto& characterFile : characterFiles) {
        CharacterDefinition character = parseCharacterDefinition(readJsonFile(characterFile));
        loaded.characters[character.id] = character;
        contentFiles.push_back(characterFile);
    }

    loaded.contentHash = buildDirectoryContentHash(contentFiles);
    return loaded;
}

LoadedGameplayConfig loadGameplayConfig() {
    for (const auto& candidate : getCandidateConfigRoots()) {
        if (!std::filesystem::exists(candidate)) {
            continue;
        }

        std::filesystem::path resolvedPath = std::filesystem::weakly_canonical(candidate);
        if (std::filesystem::is_regular_file(resolvedPath) && resolvedPath.filename() == "gameplay.json") {
            std::stringstream buffer;
            std::ifstream file(resolvedPath);
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

            for (const auto& [id, passive] : loaded.passives) {
                if (id != passive.id) {
                    throw std::runtime_error("PassiveDefinition key mismatch for '" + id + "'");
                }
                validatePassiveDefinition(passive);
            }

            for (const auto& [id, character] : loaded.characters) {
                if (id != character.id) {
                    throw std::runtime_error("CharacterDefinition key mismatch for '" + id + "'");
                }
                validateCharacterDefinition(character, loaded.spells, loaded.passives);
            }

            validateWorldDefinition(loaded.world);
            return loaded;
        }

        if (std::filesystem::is_directory(resolvedPath) && isSplitConfigRoot(resolvedPath)) {
            LoadedGameplayConfig loaded = loadSplitGameplayConfig(resolvedPath);

            if (loaded.spells.empty()) {
                throw std::runtime_error("GameConfig has no spell definitions");
            }
            if (loaded.passives.empty()) {
                throw std::runtime_error("GameConfig has no passive definitions");
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

            for (const auto& [id, passive] : loaded.passives) {
                if (id != passive.id) {
                    throw std::runtime_error("PassiveDefinition key mismatch for '" + id + "'");
                }
                validatePassiveDefinition(passive);
            }

            for (const auto& [id, character] : loaded.characters) {
                if (id != character.id) {
                    throw std::runtime_error("CharacterDefinition key mismatch for '" + id + "'");
                }
                validateCharacterDefinition(character, loaded.spells, loaded.passives);
            }

            validateWorldDefinition(loaded.world);
            return loaded;
        }
    }

    throw std::runtime_error("Could not locate gameplay config. Expected split config at config/{world.json,spells/,passives/,characters/} or legacy gameplay.json");
}

const LoadedGameplayConfig& getLoadedGameplayConfig() {
    static const LoadedGameplayConfig config = loadGameplayConfig();
    return config;
}
}

const std::map<std::string, SpellDefinition>& GameConfig::getSpellDefinitions() {
    return getLoadedGameplayConfig().spells;
}

const std::map<std::string, PassiveDefinition>& GameConfig::getPassiveDefinitions() {
    return getLoadedGameplayConfig().passives;
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

const PassiveDefinition& GameConfig::getPassiveDefinition(const std::string& passiveId) {
    const auto& definitions = getPassiveDefinitions();
    auto it = definitions.find(passiveId);
    if (it != definitions.end()) {
        return it->second;
    }

    throw std::runtime_error("Unknown passive definition: " + passiveId);
}

const CharacterDefinition& GameConfig::getCharacterDefinition(const std::string& characterId) {
    const auto& definitions = getCharacterDefinitions();
    auto it = definitions.find(characterId);
    if (it != definitions.end()) {
        return it->second;
    }

    return definitions.at("meteor");
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

    json passiveIds = json::array();
    for (const auto& [id, definition] : getPassiveDefinitions()) {
        passiveIds.push_back(id);
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
        {"passives", {
            {"count", getPassiveDefinitions().size()},
            {"ids", passiveIds}
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

json GameConfig::to_json(const PassiveDefinition& passive) {
    return {
        {"id", passive.id},
        {"name", passive.name},
        {"durationMs", passive.durationMs},
        {"tickDamage", passive.tickDamage},
        {"tickIntervalMs", passive.tickIntervalMs},
        {"movementSlowPct", passive.movementSlowPct},
        {"applicationChances", passive.applicationChances}
    };
}

json GameConfig::to_json(const CharacterDefinition& character) {
    json animations = json::object();
    for (const auto& [animationId, clip] : character.presentation.animations) {
        json clipJson = {
            {"fps", clip.fps},
            {"loop", clip.loop}
        };
        for (const auto& [direction, frames] : clip.directions) {
            clipJson[direction] = frames;
        }
        animations[animationId] = clipJson;
    }

    return {
        {"id", character.id},
        {"name", character.name},
        {"description", character.description},
        {"descriptionKey", character.descriptionKey},
        {"maxHp", character.maxHp},
        {"movementSpeed", character.movementSpeed},
        {"damageMultiplier", character.damageMultiplier},
        {"colliderWidth", character.colliderWidth},
        {"colliderHeight", character.colliderHeight},
        {"autoAttackSpellId", character.autoAttackSpellId},
        {"skillIds", character.skillIds},
        {"passiveId", character.passiveId},
        {"presentation", {
            {"image", character.presentation.image},
            {"frameWidth", character.presentation.frameWidth},
            {"frameHeight", character.presentation.frameHeight},
            {"renderScale", character.presentation.renderScale},
            {"directions", character.presentation.directions},
            {"animations", animations}
        }}
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
