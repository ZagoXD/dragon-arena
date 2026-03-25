#ifndef MAP_LOADER_H
#define MAP_LOADER_H

#include <string>
#include <vector>
#include <map>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

struct SpawnPoint {
    std::string name;
    std::string type;
    float x;
    float y;
};

class MapLoader {
private:
    int widthTiles;
    int heightTiles;
    int sourceTileSize;
    int worldTileSize;
    float scale;
    
    int widthPixels;
    int heightPixels;
    
    std::vector<bool> collisionGrid;
    std::vector<SpawnPoint> playerSpawns;
    std::vector<SpawnPoint> dummySpawns;
    json rawMapData;
    
    bool loaded;

public:
    MapLoader();
    bool loadMap(const std::string& filepath);
    
    // Getters
    bool isLoaded() const { return loaded; }
    const json& getRawMapData() const { return rawMapData; }
    int getWidthPixels() const { return widthPixels; }
    int getHeightPixels() const { return heightPixels; }
    int getWidthTiles() const { return widthTiles; }
    int getHeightTiles() const { return heightTiles; }
    int getWorldTileSize() const { return worldTileSize; }
    float getScale() const { return scale; }
    
    const std::vector<SpawnPoint>& getPlayerSpawns() const { return playerSpawns; }
    const std::vector<SpawnPoint>& getDummySpawns() const { return dummySpawns; }
    
    bool isBlocked(float x, float y, float width = 64.0f, float height = 64.0f) const;
};

#endif
