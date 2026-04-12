#include "MapCatalog.h"

namespace {
const MapCatalogEntry kTrainingMap = {
    "training_map",
    "map-assets/tiled/training_map.tmj",
    {}
};

const MapCatalogEntry kArenaMap = {
    "arena_map",
    "map-assets/tiled/arena_map.tmj",
    {"player_spawn_1", "player_spawn_2"}
};
}

const MapCatalogEntry& MapCatalog::getTrainingMap() {
    return kTrainingMap;
}

const MapCatalogEntry& MapCatalog::getDefaultArenaMap() {
    return kArenaMap;
}

const MapCatalogEntry& MapCatalog::getForInstanceMode(const std::string& instanceMode) {
    if (instanceMode == "match") {
        return getDefaultArenaMap();
    }

    return getTrainingMap();
}
