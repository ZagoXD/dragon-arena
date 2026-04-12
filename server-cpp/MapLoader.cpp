#include "MapLoader.h"
#include <iostream>
#include <fstream>
#include <cmath>
#include <stack>

MapLoader::MapLoader() 
    : widthTiles(0), heightTiles(0), sourceTileSize(32), worldTileSize(64), scale(2.0f),
      widthPixels(0), heightPixels(0), loaded(false) {}

bool MapLoader::loadMap(const std::string& filepath) {
    loaded = false;
    rawMapData = json();
    collisionGrid.clear();
    hideRegionGrid.clear();
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
        hideRegionGrid.assign(widthTiles * heightTiles, 0);

        int totalBlocked = 0;
        int nextHideRegionId = 1;
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
            else if (type == "tilelayer" && (name == "Hide" || name == "hide")) {
                const auto& data = layer["data"];
                for (int row = 0; row < heightTiles; ++row) {
                    for (int col = 0; col < widthTiles; ++col) {
                        const int startIndex = row * widthTiles + col;
                        if (startIndex >= static_cast<int>(data.size()) || data[startIndex] <= 0 || hideRegionGrid[startIndex] != 0) {
                            continue;
                        }

                        std::stack<std::pair<int, int>> flood;
                        flood.push({col, row});
                        hideRegionGrid[startIndex] = nextHideRegionId;

                        while (!flood.empty()) {
                            const auto [currentCol, currentRow] = flood.top();
                            flood.pop();

                            const std::vector<std::pair<int, int>> neighbors = {
                                {currentCol + 1, currentRow},
                                {currentCol - 1, currentRow},
                                {currentCol, currentRow + 1},
                                {currentCol, currentRow - 1}
                            };

                            for (const auto& [neighborCol, neighborRow] : neighbors) {
                                if (neighborCol < 0 || neighborCol >= widthTiles || neighborRow < 0 || neighborRow >= heightTiles) {
                                    continue;
                                }

                                const int neighborIndex = neighborRow * widthTiles + neighborCol;
                                if (neighborIndex >= static_cast<int>(data.size()) || data[neighborIndex] <= 0 || hideRegionGrid[neighborIndex] != 0) {
                                    continue;
                                }

                                hideRegionGrid[neighborIndex] = nextHideRegionId;
                                flood.push({neighborCol, neighborRow});
                            }
                        }

                        nextHideRegionId += 1;
                    }
                }
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

int MapLoader::getHideRegionIdAtWorldPoint(float worldX, float worldY) const {
    if (!loaded) {
        return 0;
    }

    const int col = static_cast<int>(std::floor(worldX / static_cast<float>(worldTileSize)));
    const int row = static_cast<int>(std::floor(worldY / static_cast<float>(worldTileSize)));

    if (col < 0 || col >= widthTiles || row < 0 || row >= heightTiles) {
        return 0;
    }

    const int index = row * widthTiles + col;
    if (index < 0 || index >= static_cast<int>(hideRegionGrid.size())) {
        return 0;
    }

    return hideRegionGrid[index];
}

int MapLoader::getHideRegionIdForActor(float x, float y, float width, float height) const {
    const float probeX = x + width / 2.0f;
    const float probeY = y + height - 4.0f;
    return getHideRegionIdAtWorldPoint(probeX, probeY);
}

const SpawnPoint* MapLoader::findPlayerSpawnByName(const std::string& spawnName) const {
    for (const SpawnPoint& spawn : playerSpawns) {
        if (spawn.name == spawnName) {
            return &spawn;
        }
    }

    return nullptr;
}
