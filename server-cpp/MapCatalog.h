#ifndef MAP_CATALOG_H
#define MAP_CATALOG_H

#include <string>
#include <vector>

struct MapCatalogEntry {
    std::string id;
    std::string path;
    std::vector<std::string> reservedPlayerSpawnNames;
};

class MapCatalog {
public:
    static const MapCatalogEntry& getTrainingMap();
    static const MapCatalogEntry& getDefaultArenaMap();
    static const MapCatalogEntry& getForInstanceMode(const std::string& instanceMode);
};

#endif
