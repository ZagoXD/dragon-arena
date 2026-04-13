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

struct PassiveDefinition {
    std::string id;
    std::string name;
    int durationMs;
    int tickDamage;
    int tickIntervalMs;
    float movementSlowPct;
    std::map<std::string, float> applicationChances;
};

struct CharacterDefinition {
    struct AnimationClipDefinition {
        std::map<std::string, std::vector<int>> directions;
        int fps = 0;
        bool loop = true;
    };

    struct PresentationDefinition {
        std::string image;
        int frameWidth = 0;
        int frameHeight = 0;
        float renderScale = 1.0f;
        std::vector<std::string> directions;
        std::map<std::string, AnimationClipDefinition> animations;
    };

    std::string id;
    std::string name;
    std::string description;
    std::string descriptionKey;
    int maxHp;
    float movementSpeed;
    float damageMultiplier;
    float colliderWidth;
    float colliderHeight;
    std::string autoAttackSpellId;
    std::vector<std::string> skillIds;
    std::string passiveId;
    PresentationDefinition presentation;
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
    static const std::map<std::string, PassiveDefinition>& getPassiveDefinitions();
    static const std::map<std::string, CharacterDefinition>& getCharacterDefinitions();
    static const WorldDefinition& getWorldDefinition();
    static const SpellDefinition& getSpellDefinition(const std::string& spellId);
    static const PassiveDefinition& getPassiveDefinition(const std::string& passiveId);
    static const CharacterDefinition& getCharacterDefinition(const std::string& characterId);
    static void validateDefinitions();
    static json buildContentSummary();
    static std::string getLoadedConfigPath();
    static std::string getContentHash();
    static json to_json(const SpellDefinition& spell);
    static json to_json(const PassiveDefinition& passive);
    static json to_json(const CharacterDefinition& character);
    static json to_json(const WorldDefinition& world);
};

#endif
