cmake_minimum_required(VERSION 3.15)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# Forcar o Link Estatico do C++ Runtime no Windows (Evita erro 0xc000007b em VMs sem Redistributable)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Nome do projeto
project(DragonArenaServer)

# Desativar mensagens de segurança chatas do Windows e o aviso do zlib
add_definitions(-D_CRT_SECURE_NO_WARNINGS)
add_definitions(-DUWS_NO_ZLIB)
add_definitions(-DLIBUS_USE_LIBUV) # Usar libuv como motor no Windows
add_definitions(-DLIBUS_NO_SSL)   # Desativar SSL para evitar erros de linker

# Definir o padrao do C++ (uWebSockets exige C++20 para os inicializadores .open, .message)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

# 1. nlohmann_json
FetchContent_Declare(
  json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.2
)
FetchContent_MakeAvailable(json)

# 2. libuv (Motor de rede exigido pelo uWebSockets no Windows)
FetchContent_Declare(
  libuv
  GIT_REPOSITORY https://github.com/libuv/libuv.git
  GIT_TAG v1.44.2
)
set(LIBUV_BUILD_SHARED OFF CACHE BOOL "Build static lib" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Build static lib" FORCE) # Desativar DLLs globais
set(ASCIIDOC_EXECUTABLE OFF CACHE BOOL "Off") # Desativar docs do libuv
FetchContent_MakeAvailable(libuv)

# 3. uSockets
FetchContent_Declare(
  usockets
  GIT_REPOSITORY https://github.com/uNetworking/uSockets.git
  GIT_TAG v0.8.8
)
FetchContent_MakeAvailable(usockets)

# 4. uWebSockets
FetchContent_Declare(
  uwebsockets
  GIT_REPOSITORY https://github.com/uNetworking/uWebSockets.git
  GIT_TAG v20.62.0
)
FetchContent_MakeAvailable(uwebsockets)

# Arquivos do uSockets necessários para o motor libuv
set(US_SOURCES
    "${usockets_SOURCE_DIR}/src/bsd.c"
    "${usockets_SOURCE_DIR}/src/context.c"
    "${usockets_SOURCE_DIR}/src/loop.c"
    "${usockets_SOURCE_DIR}/src/socket.c"
    "${usockets_SOURCE_DIR}/src/udp.c"
    "${usockets_SOURCE_DIR}/src/quic.c"
    "${usockets_SOURCE_DIR}/src/eventing/libuv.c"
)

# Adicionar o executavel
add_executable(DragonArenaServer 
    main.cpp 
    Player.cpp
    CombatSystem.cpp
    MovementSystem.cpp
    GameWorld.cpp
    NetworkHandler.cpp
    MapLoader.cpp
    ${US_SOURCES}
)

# Incluir os diretorios
target_include_directories(DragonArenaServer PRIVATE 
    ${json_SOURCE_DIR}/single_include
    ${uwebsockets_SOURCE_DIR}/src
    ${usockets_SOURCE_DIR}/src
    ${libuv_SOURCE_DIR}/include
)

# Linkar as bibliotecas
target_link_libraries(DragonArenaServer PRIVATE 
    nlohmann_json::nlohmann_json
    uv_a
)

# No Windows, precisamos linkar as bibliotecas de sistema para rede
if(WIN32)
    target_link_libraries(DragonArenaServer PRIVATE ws2_32 iphlpapi)
endif()

# Nota: uWebSockets e apenas headers, mas o uSockets pode precisar ser 
# compilado dependendo de como voce o usa. Para esse MVP, os headers bastam.

# Opcional: Definir onde o .exe sera gerado
set_target_properties(DragonArenaServer PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")
