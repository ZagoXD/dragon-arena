#include "MapLoader.h"
#include <iostream>
#include <fstream>
#include <cmath>

MapLoader::MapLoader() 
    : widthTiles(0), heightTiles(0), sourceTileSize(32), worldTileSize(64), scale(2.0f),
      widthPixels(0), heightPixels(0), loaded(false) {}

bool MapLoader::loadMap(const std::string& filepath) {
    loaded = false;
    rawMapData = json();
    collisionGrid.clear();
    playerSpawns.clear();
    dummySpawns.clear();

    std::vector<std::string> pathsToTry = {
        filepath,
        "../" + filepath,
        "../../" + filepath,
        "../../../" + filepath,
        "../../../../" + filepath,
        "../../../../../" + filepath
    };

    std::ifstream file;
    std::string successfulPath = "";

    for (const auto& path : pathsToTry) {
        file.open(path);
        if (file.is_open()) {
            successfulPath = path;
            break;
        }
    }

    if (!file.is_open()) {
        std::cerr << "[MapLoader] Error: Could not open map file. Tried multiple relative paths for: " << filepath << std::endl;
        return false;
    }

    try {
        file >> rawMapData;
        
        widthTiles = rawMapData["width"];
        heightTiles = rawMapData["height"];
        sourceTileSize = rawMapData.contains("tilewidth") ? (int)rawMapData["tilewidth"] : 32;
        
        // As requested:
        worldTileSize = 64;
        scale = static_cast<float>(worldTileSize) / static_cast<float>(sourceTileSize);
        
        widthPixels = widthTiles * worldTileSize;
        heightPixels = heightTiles * worldTileSize;
        
        collisionGrid.assign(widthTiles * heightTiles, false);
        
        int totalBlocked = 0;
        for (const auto& layer : rawMapData["layers"]) {
            std::string type = layer["type"];
            std::string name = layer["name"];
            
            if (type == "tilelayer" && (name == "walls" || name == "collision")) {
                int blockedCount = 0;
                const auto& data = layer["data"];
                for (size_t i = 0; i < data.size() && i < collisionGrid.size(); ++i) {
                    if (data[i] > 0) {
                        collisionGrid[i] = true;
                        blockedCount++;
                    }
                }
                totalBlocked += blockedCount;
                std::cout << "[MapLoader] Collision layer '" << name << "' blocked tiles: " << blockedCount << std::endl;
            }
            else if (type == "objectgroup" && name == "spawns") {
                for (const auto& obj : layer["objects"]) {
                    SpawnPoint pt;
                    pt.name = obj.contains("name") ? obj["name"].get<std::string>() : "unknown";
                    pt.x = obj["x"].get<float>() * scale;
                    pt.y = obj["y"].get<float>() * scale;
                    
                    if (obj.contains("properties")) {
                        for (const auto& prop : obj["properties"]) {
                            if (prop["name"] == "type") {
                                pt.type = prop["value"].get<std::string>();
                            }
                        }
                    }
                    
                    if (pt.type == "player_spawn") {
                        playerSpawns.push_back(pt);
                    } else if (pt.type == "dummy_spawn") {
                        dummySpawns.push_back(pt);
                    }
                }
            }
        }
        
        loaded = true;
        std::cout << "[MapLoader] Successfully loaded map: " << successfulPath << std::endl;
        std::cout << "[MapLoader] Dimensions: " << widthTiles << "x" << heightTiles << " tiles (" << widthPixels << "x" << heightPixels << " px)" << std::endl;
        std::cout << "[MapLoader] Total blocked tiles: " << totalBlocked << std::endl;
        std::cout << "[MapLoader] Spawns: " << playerSpawns.size() << " players, " << dummySpawns.size() << " dummies." << std::endl;
        
        return true;
    } catch (const std::exception& e) {
        std::cerr << "[MapLoader] Exception while parsing JSON: " << e.what() << std::endl;
        return false;
    }
}

// Basic AABB / Grid collision check
bool MapLoader::isBlocked(float x, float y, float width, float height) const {
    if (!loaded) return false;
    
    // Check boundaries
    if (x < 0 || y < 0 || x + width > widthPixels || y + height > heightPixels) {
        return true;
    }
    
    // Check the grid cells the entity overlaps
    int minCol = static_cast<int>(x) / worldTileSize;
    int maxCol = static_cast<int>(x + width - 1) / worldTileSize;
    int minRow = static_cast<int>(y) / worldTileSize;
    int maxRow = static_cast<int>(y + height - 1) / worldTileSize;
    
    for (int row = minRow; row <= maxRow; ++row) {
        for (int col = minCol; col <= maxCol; ++col) {
            if (row >= 0 && row < heightTiles && col >= 0 && col < widthTiles) {
                int index = row * widthTiles + col;
                if (collisionGrid[index]) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

const SpawnPoint* MapLoader::findPlayerSpawnByName(const std::string& spawnName) const {
    for (const SpawnPoint& spawn : playerSpawns) {
        if (spawn.name == spawnName) {
            return &spawn;
        }
    }

    return nullptr;
}
