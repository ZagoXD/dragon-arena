cmake_minimum_required(VERSION 3.15)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)

# Forcar o Link Estatico do C++ Runtime no Windows (Evita erro 0xc000007b em VMs sem Redistributable)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

# Nome do projeto
project(DragonArenaServer)
enable_testing()

# Desativar mensagens de segurança chatas do Windows e o aviso do zlib
add_definitions(-D_CRT_SECURE_NO_WARNINGS)
add_definitions(-DUWS_NO_ZLIB)
add_definitions(-DLIBUS_USE_LIBUV) # Usar libuv como motor no Windows
add_definitions(-DLIBUS_NO_SSL)   # Desativar SSL para evitar erros de linker

# Definir o padrao do C++ (uWebSockets exige C++20 para os inicializadores .open, .message)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

set(POSTGRESQL_ROOT_HINTS
    $ENV{PGROOT}
    $ENV{PostgreSQL_ROOT}
    "C:/Program Files/PostgreSQL/18"
    "C:/Program Files/PostgreSQL/17"
    "C:/Program Files/PostgreSQL/16"
    "C:/Program Files/PostgreSQL/15"
)

find_path(PostgreSQL_INCLUDE_DIR
    NAMES libpq-fe.h
    HINTS ${POSTGRESQL_ROOT_HINTS}
    PATH_SUFFIXES include
)

find_library(PostgreSQL_LIBRARY
    NAMES libpq
    HINTS ${POSTGRESQL_ROOT_HINTS}
    PATH_SUFFIXES lib
)

find_file(PostgreSQL_DLL
    NAMES libpq.dll
    HINTS ${POSTGRESQL_ROOT_HINTS}
    PATH_SUFFIXES bin
)

find_path(PostgreSQL_BIN_DIR
    NAMES libpq.dll
    HINTS ${POSTGRESQL_ROOT_HINTS}
    PATH_SUFFIXES bin
)

if(NOT PostgreSQL_INCLUDE_DIR OR NOT PostgreSQL_LIBRARY)
    message(FATAL_ERROR "PostgreSQL client files not found. Set PGROOT or install PostgreSQL locally.")
endif()

set(POSTGRESQL_RUNTIME_DLL_NAMES
    libpq.dll
    libssl-3-x64.dll
    libcrypto-3-x64.dll
    libintl-9.dll
    libiconv-2.dll
    libwinpthread-1.dll
)

set(POSTGRESQL_RUNTIME_DLLS "")
if(PostgreSQL_BIN_DIR)
    foreach(runtime_dll_name IN LISTS POSTGRESQL_RUNTIME_DLL_NAMES)
        if(EXISTS "${PostgreSQL_BIN_DIR}/${runtime_dll_name}")
            list(APPEND POSTGRESQL_RUNTIME_DLLS "${PostgreSQL_BIN_DIR}/${runtime_dll_name}")
        endif()
    endforeach()
endif()

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
    auth/AuthService.cpp
    auth/PasswordHasher.cpp
    auth/SessionService.cpp
    database/Database.cpp
    database/UserRepository.cpp
    moderation/ModerationRepository.cpp
    moderation/ReportRepository.cpp
    social/FriendshipRepository.cpp
    social/PrivateChatRepository.cpp
    social/ArenaChatRepository.cpp
    GameConfig.cpp
    Player.cpp
    CombatSystem.cpp
    BurnSystem.cpp
    MovementSystem.cpp
    MapCatalog.cpp
    GameWorld.cpp
    DashSystem.cpp
    SkillSystem.cpp
    ProjectileSystem.cpp
    ProtocolPayloadBuilder.cpp
    RespawnSystem.cpp
    ServerDiagnostics.cpp
    WorldSetup.cpp
    WorldTickRunner.cpp
    WorldSnapshotBuilder.cpp
    NetworkHandler.cpp
    MapLoader.cpp
    ${US_SOURCES}
)

# Incluir os diretorios
target_include_directories(DragonArenaServer PRIVATE 
    ${PostgreSQL_INCLUDE_DIR}
    ${json_SOURCE_DIR}/single_include
    ${uwebsockets_SOURCE_DIR}/src
    ${usockets_SOURCE_DIR}/src
    ${libuv_SOURCE_DIR}/include
)

# Linkar as bibliotecas
target_link_libraries(DragonArenaServer PRIVATE 
    ${PostgreSQL_LIBRARY}
    nlohmann_json::nlohmann_json
    uv_a
)

# No Windows, precisamos linkar as bibliotecas de sistema para rede
if(WIN32)
    target_link_libraries(DragonArenaServer PRIVATE ws2_32 iphlpapi bcrypt)
endif()

# Nota: uWebSockets e apenas headers, mas o uSockets pode precisar ser 
# compilado dependendo de como voce o usa. Para esse MVP, os headers bastam.

# Opcional: Definir onde o .exe sera gerado
set_target_properties(DragonArenaServer PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin")

add_executable(DragonArenaGameplayTests
    tests/GameplayTests.cpp
    tests/NetworkHandlerStub.cpp
    auth/AuthService.cpp
    auth/PasswordHasher.cpp
    auth/SessionService.cpp
    database/Database.cpp
    database/UserRepository.cpp
    moderation/ModerationRepository.cpp
    moderation/ReportRepository.cpp
    social/FriendshipRepository.cpp
    social/PrivateChatRepository.cpp
    social/ArenaChatRepository.cpp
    GameConfig.cpp
    Player.cpp
    CombatSystem.cpp
    BurnSystem.cpp
    MovementSystem.cpp
    MapCatalog.cpp
    GameWorld.cpp
    SkillSystem.cpp
    ProjectileSystem.cpp
    DashSystem.cpp
    RespawnSystem.cpp
    ProtocolPayloadBuilder.cpp
    ServerDiagnostics.cpp
    WorldSetup.cpp
    WorldTickRunner.cpp
    WorldSnapshotBuilder.cpp
    MapLoader.cpp
)

target_include_directories(DragonArenaGameplayTests PRIVATE 
    ${PostgreSQL_INCLUDE_DIR}
    ${json_SOURCE_DIR}/single_include
    ${uwebsockets_SOURCE_DIR}/src
    ${usockets_SOURCE_DIR}/src
    ${libuv_SOURCE_DIR}/include
)

target_link_libraries(DragonArenaGameplayTests PRIVATE 
    ${PostgreSQL_LIBRARY}
    nlohmann_json::nlohmann_json
)

if(WIN32)
    target_link_libraries(DragonArenaGameplayTests PRIVATE bcrypt)
endif()

if(WIN32 AND POSTGRESQL_RUNTIME_DLLS)
    foreach(runtime_dll IN LISTS POSTGRESQL_RUNTIME_DLLS)
        add_custom_command(TARGET DragonArenaServer POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${runtime_dll}"
            $<TARGET_FILE_DIR:DragonArenaServer>
        )

        add_custom_command(TARGET DragonArenaGameplayTests POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${runtime_dll}"
            $<TARGET_FILE_DIR:DragonArenaGameplayTests>
        )
    endforeach()
endif()

add_test(NAME DragonArenaGameplayTests COMMAND DragonArenaGameplayTests)
