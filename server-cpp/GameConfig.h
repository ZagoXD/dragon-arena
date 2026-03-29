#ifndef GAME_CONFIG_H
#define GAME_CONFIG_H

#include <map>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

struct SpellDefinition {
    std::string id;
    std::string name;
    int damage;
    float range;
    int castTimeMs;
    int cooldownMs;
    float projectileSpeed;
    float projectileRadius;
    int effectDurationMs;
};

struct CharacterDefinition {
    std::string id;
    std::string name;
    int maxHp;
    float movementSpeed;
    float colliderWidth;
    float colliderHeight;
    std::string autoAttackSpellId;
    std::vector<std::string> skillIds;
};

struct WorldDefinition {
    int tileSize;
    int mapWidth;
    int mapHeight;
    int dummyMaxHp;
    int dummyRespawnMs;
    int dummyColliderSize;
    int playerRespawnMs;
};

class GameConfig {
public:
    static const std::map<std::string, SpellDefinition>& getSpellDefinitions();
    static const std::map<std::string, CharacterDefinition>& getCharacterDefinitions();
    static const WorldDefinition& getWorldDefinition();
    static const SpellDefinition& getSpellDefinition(const std::string& spellId);
    static const CharacterDefinition& getCharacterDefinition(const std::string& characterId);
    static void validateDefinitions();
    static json buildContentSummary();
    static std::string getLoadedConfigPath();
    static std::string getContentHash();
    static json to_json(const SpellDefinition& spell);
    static json to_json(const CharacterDefinition& character);
    static json to_json(const WorldDefinition& world);
};

#endif
