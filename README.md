# Dragon Arena

Dragon Arena roda hoje com uma arquitetura de **servidor autoritativo em C++** e **cliente desktop em Electron/React/PixiJS**.

O backend é a fonte de verdade do gameplay. O frontend envia intenção, recebe estado autoritativo e cuida da renderização, HUD, câmera e feedback visual.

## Arquitetura

### `server-cpp/`

Servidor autoritativo do jogo.

- Networking com `uWebSockets` + `nlohmann/json`
- Tick autoritativo e snapshots periódicos
- Mapa carregado de `map-assets/tiled/default_map.tmj`
- Gameplay carregado de arquivos JSON separados por domínio
- Sistemas organizados por responsabilidade:
  - `CombatSystem`
  - `MovementSystem`
  - `SkillSystem`
  - `ProjectileSystem`
  - `DashSystem`
  - `BurnSystem`
  - `RespawnSystem`
  - `WorldSetup`
  - `WorldTickRunner`
  - `WorldSnapshotBuilder`

Responsabilidades do backend:

- spawn e respawn de players e dummies
- movimento autoritativo
- colisão com mapa
- auto attack, skills e passivas
- projéteis, áreas de efeito e dano
- kill/death e scoreboard
- bootstrap de sessão
- snapshots e eventos autoritativos

Observação importante:

- o **respawn automático de players agora é autoritativo no backend**
- o frontend só exibe o countdown visual

### `client-electron/`

Cliente desktop do jogo.

- Shell desktop em Electron
- UI em React + TypeScript
- Renderização da arena em PixiJS
- HUD, seleção de personagem, nome e overlays em React

Responsabilidades do cliente:

- input local
- câmera
- interpolação visual
- HUD e menus
- feedback visual de skills, projéteis e passivas
- render de mapa, players, dummies e efeitos

O cliente **não decide gameplay crítico**.

## PersistÃªncia

O backend agora tem uma camada inicial de banco em `server-cpp/database/`:

- [Database.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/Database.h)
- [Database.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/Database.cpp)
- [UserRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/UserRepository.h)
- [UserRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/UserRepository.cpp)

Essa base usa o cliente nativo do PostgreSQL (`libpq`) e prepara o servidor para `register/login` sem espalhar SQL pelo resto do projeto.

Hoje ela cobre:

- conexÃ£o com PostgreSQL
- `SELECT 1` de validaÃ§Ã£o no startup
- busca de usuÃ¡rio por email
- busca de usuÃ¡rio por username
- busca por email ou username
- criaÃ§Ã£o de usuÃ¡rio
- criaÃ§Ã£o de perfil inicial
- transaÃ§Ã£o para criar usuÃ¡rio + perfil
- relaÃ§Ãµes de amizade em `friendships`
- pedidos pendentes recebidos e enviados
- presenÃ§a online/offline por socket autenticado

VariÃ¡veis de ambiente aceitas:

- `DRAGON_DB_URL` ou `DATABASE_URL`
- `DRAGON_DB_HOST` ou `PGHOST`
- `DRAGON_DB_PORT` ou `PGPORT`
- `DRAGON_DB_NAME` ou `PGDATABASE`
- `DRAGON_DB_USER` ou `PGUSER`
- `DRAGON_DB_PASSWORD` ou `PGPASSWORD`

Defaults do projeto quando nenhuma env Ã© informada:

- host: `127.0.0.1`
- port: `5432`
- database: `dragon_arena`
- user: `dragon_app`

No startup, o servidor tenta:

1. abrir conexÃ£o com o banco
2. executar `SELECT 1`
3. contar usuÃ¡rios da tabela `users`

ObservaÃ§Ã£o sobre amizades:

- a tabela `public.friendships` precisa existir no PostgreSQL
- se ela for criada manualmente por um usuÃ¡rio admin, o usuÃ¡rio `dragon_app` tambÃ©m precisa de permissÃµes de `SELECT/INSERT/UPDATE/DELETE` na tabela
- o `dragon_app` tambÃ©m precisa de `USAGE/SELECT` na sequence `public.friendships_id_seq`

## Sistema Social

O cliente agora possui uma **friend list** integrada Ã  tela inicial.

Hoje o fluxo cobre:

- painel `Amigos` no canto inferior direito
- expandir/minimizar painel
- badge de notificaÃ§Ãµes para novos pedidos recebidos
- envio de amizade por `nickname + tag`
- listagem de amigos com nome, tag e status online/offline
- pedidos recebidos com `aceitar` e `recusar`
- modal central para pedidos pendentes enviados
- cancelamento de pedidos enviados
- menu contextual customizado com clique direito em um amigo
- exclusÃ£o de amizade com modal de confirmaÃ§Ã£o

Backend principal do sistema social:

- [FriendshipRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/FriendshipRepository.h)
- [FriendshipRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/FriendshipRepository.cpp)
- [NetworkHandler.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/NetworkHandler.h)
- [NetworkHandler.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/NetworkHandler.cpp)

Frontend principal do sistema social:

- [FriendListPanel.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/FriendListPanel/FriendListPanel.tsx)
- [FriendListPanel.css](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/FriendListPanel/FriendListPanel.css)
- [HomeScreen.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/HomeScreen/HomeScreen.tsx)
- [App.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/App.tsx)

## Fluxo de Rede

Fluxo principal:

1. o cliente conecta no servidor
2. recebe `sessionInit`
3. inicializa bootstrap, mapa e snapshot inicial
4. consome snapshots e eventos autoritativos
5. envia intenções como `move`, `shoot` e `useSkill`

Hoje o cliente não precisa mais disparar o respawn automático. O servidor renasce o player sozinho quando `playerRespawnMs` expira.

## Estrutura de Renderização

No frontend, a arena está organizada assim:

- [App.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/App.tsx): fluxo de telas
- [Arena.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/Arena.tsx): composição principal da arena
- [PixiArenaView.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/PixiArenaView.tsx): renderização do mundo em Pixi
- [useSocket.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useSocket.ts): transporte e protocolo
- [useArenaNetworkState.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaNetworkState.ts): consumo do estado autoritativo
- [useArenaController.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaController.ts): input, aiming, câmera e fluxo local

## Configuração de Gameplay

O gameplay do servidor não fica mais em um único `gameplay.json`.

Hoje ele é montado a partir de arquivos separados em `server-cpp/config/`:

- [world.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/world.json)
- [charizard.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/characters/charizard.json)
- [ember.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/spells/ember.json)
- [dragon_dive.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/spells/dragon_dive.json)
- [flamethrower.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/spells/flamethrower.json)
- [fire_blast.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/spells/fire_blast.json)
- [burn.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/passives/burn.json)

Esse modelo facilita:

- manutenção
- expansão de conteúdo
- merge em equipe
- validação por domínio

## Mapa

O mapa é exportado do Tiled e lido pelo backend em:

- [default_map.tmj](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/map-assets/tiled/default_map.tmj)

Camadas usadas hoje:

- `ground`
- `plants`
- `collision`
- `walls`
- `spawns`

O backend lê o mapa e o entrega ao cliente no bootstrap da sessão. O cliente usa esses dados para montar a renderização visual localmente.

## Como Rodar

### Backend

O servidor precisa destes itens no mesmo contexto de execução:

- `DragonArenaServer.exe`
- pasta `config/`
- pasta `map-assets/`

Estrutura esperada:

```txt
server/
  DragonArenaServer.exe
  config/
    world.json
    characters/
      charizard.json
    spells/
      ember.json
      dragon_dive.json
      flamethrower.json
      fire_blast.json
    passives/
      burn.json
  map-assets/
    tiled/
      default_map.tmj
```

Observação:

- o servidor procura `config/` e `map-assets/tiled/default_map.tmj` por caminhos relativos

### Cliente em desenvolvimento

Dentro de [client-electron](C:/Users/gugu_/Documents/github/dragon-arena/client-electron):

```bash
npm install
npm run dev
```

Por padrão o cliente tenta conectar em:

```txt
ws://localhost:3001
```

Você pode ajustar isso por `VITE_SERVER_URL`.

### Cliente empacotado

O app Electron empacotado não é só o `.exe`.

Para distribuir manualmente, use a pasta inteira:

- `client-electron/release/0.0.1/win-unpacked/`

Ela contém:

- executável
- DLLs do Electron
- `resources/`
- `app.asar`

Se copiar só o `.exe`, o cliente não roda corretamente.

Observação:

- o cliente empacotado ainda depende de um backend acessível
- hoje ele não sobe o servidor C++ sozinho

## Estado Atual

Hoje o projeto está consolidado neste modelo:

- backend C++ como fonte da verdade
- frontend Electron/React/Pixi como camada visual
- gameplay separado por arquivos de config
- protocolo de sessão consolidado
- respawn autoritativo no servidor
- arena renderizada em PixiJS

Em resumo:

**a arquitetura principal de servidor autoritativo + cliente visual já está estabelecida.**
