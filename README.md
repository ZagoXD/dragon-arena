# Dragon Arena

Dragon Arena roda hoje com backend autoritativo em C++ e cliente desktop em Electron/React/PixiJS.

O servidor é a fonte de verdade do gameplay. O cliente envia intenção, recebe estado autoritativo e cuida da renderização, HUD, câmera, menus e feedback visual.

## Arquitetura

### `server-cpp/`

Servidor autoritativo do jogo.

- `uWebSockets` + `nlohmann/json` no networking
- tick autoritativo com snapshots periódicos
- mapa carregado do Tiled
- gameplay carregado por arquivos JSON separados por domínio
- autenticação, sessão, social e chat integrados ao mesmo backend

Sistemas principais:

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

- movimento e colisão autoritativos
- auto attack, skills, passivas e escudos
- projéteis, áreas de efeito, dano e status
- spawn/respawn de players e dummies
- autenticação e sessão
- friend list, chat privado e chat da arena

### `client-electron/`

Cliente desktop do jogo.

- Electron como shell desktop
- React + TypeScript na interface
- PixiJS na arena
- HUD, menus, overlays sociais e chat em React

Responsabilidades do cliente:

- input local
- câmera
- HUD e menus
- render de mapa, players, dummies e efeitos
- feedback visual de skills, projéteis, passivas e escudos
- friend list, chat privado e chat da arena

O cliente não decide gameplay crítico.

## Persistência

O backend usa PostgreSQL via `libpq` em `server-cpp/database/`.

Hoje a persistência cobre:

- usuários e perfis
- amizades em `friendships`
- mensagens privadas em `private_messages`
- mensagens da arena em `arena_messages`
- pedidos pendentes recebidos e enviados
- presença online/offline via socket autenticado

Variáveis de ambiente aceitas:

- `DRAGON_DB_URL` ou `DATABASE_URL`
- `DRAGON_DB_HOST` ou `PGHOST`
- `DRAGON_DB_PORT` ou `PGPORT`
- `DRAGON_DB_NAME` ou `PGDATABASE`
- `DRAGON_DB_USER` ou `PGUSER`
- `DRAGON_DB_PASSWORD` ou `PGPASSWORD`

Defaults quando nenhuma env é informada:

- host: `127.0.0.1`
- port: `5432`
- database: `dragon_arena`
- user: `dragon_app`

As tabelas sociais atuais são:

- `public.friendships`
- `public.private_messages`
- `public.arena_messages`

O usuário `dragon_app` precisa de `SELECT/INSERT/UPDATE/DELETE` nessas tabelas e `USAGE/SELECT` nas sequences correspondentes.

## Sistema Social

Hoje o sistema social cobre:

- painel `Amigos` no canto inferior direito das telas autenticadas fora da arena
- envio de amizade por `nickname + tag`
- listagem de amigos com status online/offline
- pedidos recebidos com aceitar/recusar
- modal central de pedidos enviados pendentes
- cancelamento de pedidos enviados
- menu contextual customizado no clique direito
- exclusão de amizade com confirmação

Arquivos principais:

- [FriendshipRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/FriendshipRepository.h)
- [FriendshipRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/FriendshipRepository.cpp)
- [FriendListPanel.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/FriendListPanel/FriendListPanel.tsx)
- [App.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/App.tsx)

## Sistema de Chat

O projeto possui dois fluxos de chat integrados ao backend C++.

### Chat privado entre amigos

- abre por duplo clique ou pelo menu contextual
- até 4 chats privados simultâneos
- ao abrir o 5º, o mais antigo fecha automaticamente
- minimizar, expandir e fechar
- badge por conversa e badge agregada em `Amigos`
- histórico persistido no banco

Arquivos principais:

- [PrivateChatRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/PrivateChatRepository.h)
- [PrivateChatRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/PrivateChatRepository.cpp)
- [PrivateChatPanel.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/PrivateChatPanel/PrivateChatPanel.tsx)

### Chat da arena

- caixa de chat sobreposta ao viewport
- `Enter` abre o input
- com o input aberto, movimento e skills ficam bloqueados
- até 100 mensagens no histórico local do overlay
- rolagem manual com o chat aberto
- whispers com cor diferenciada
- ajuda de comandos ao digitar `/`

Comandos atuais:

- `/add Nick#TAG`
- `/w Nick#TAG mensagem`
- `/r mensagem`

Arquivos principais:

- [ArenaChatRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/ArenaChatRepository.h)
- [ArenaChatRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/ArenaChatRepository.cpp)
- [ArenaChatBox.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/ArenaChatBox/ArenaChatBox.tsx)

## Telas do Cliente

Hoje o cliente autenticado possui:

- `Início`
- `Perfil`
- `Coleção`
- `Seleção de personagem`
- `Arena`

O menu superior com `Início`, `Perfil`, `Coleção` e configurações fica disponível nas telas autenticadas fora da arena.

Arquivos principais:

- [App.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/App.tsx)
- [HomeScreen.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/HomeScreen/HomeScreen.tsx)
- [ProfileScreen.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/ProfileScreen/ProfileScreen.tsx)
- [CollectionScreen.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/CollectionScreen/CollectionScreen.tsx)
- [SelectScreen.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/SelectScreen/SelectScreen.tsx)

## Gameplay Atual

O gameplay é montado a partir de arquivos em `server-cpp/config/`.

Arquivos principais:

- [world.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/world.json)
- [charizard.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/characters/charizard.json)
- [hydra.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/characters/hydra.json)
- [burn.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/passives/burn.json)
- [poison.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/passives/poison.json)

Roster atual:

### Charizard

- passiva: `Burn`
- auto attack: `Ember`
- skill `1`: `Dragon Dive`
- skill `2`: `Flamethrower`
- skill `3`: `Fire Blast`

### Hydra

- passiva: `Poison`
- auto attack: `Scratch`
- skill `1`: `Poison Flash`
- skill `2`: `Poison Shield`
- skill `3`: `Seed Bite`

### Status especiais atuais

- `Burn`: dano ao longo do tempo
- `Poison`: dano ao longo do tempo + redução de velocidade
- `Shield`: vida extra temporária absorvida antes da vida normal
- `Root`: imobilização temporária

## Renderização da Arena

Arquivos principais:

- [Arena.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/Arena.tsx)
- [PixiArenaView.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/PixiArenaView.tsx)
- [useSocket.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useSocket.ts)
- [useArenaNetworkState.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaNetworkState.ts)
- [useArenaController.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaController.ts)

Hoje a arena já cobre:

- mapa carregado do Tiled
- players locais e remotos
- dummies
- projéteis
- áreas de efeito
- passivas visuais
- barras de vida/escudo sobre os personagens
- HUD com vida, escudo, skills e passiva

## Mapa

O mapa principal é:

- [default_map.tmj](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/map-assets/tiled/default_map.tmj)

Camadas usadas hoje:

- `ground`
- `plants`
- `props`
- `collision`
- `walls`
- `spawns`

## Como Rodar

### Backend

O servidor precisa destes itens no mesmo contexto de execução:

- `DragonArenaServer.exe`
- pasta `config/`
- pasta `map-assets/`

Estrutura mínima esperada:

```txt
server/
  DragonArenaServer.exe
  config/
    world.json
    characters/
      charizard.json
      hydra.json
    spells/
      ember.json
      dragon_dive.json
      flamethrower.json
      fire_blast.json
      scratch.json
      poison_flash.json
      poison_shield.json
      seed_bite.json
    passives/
      burn.json
      poison.json
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

Para distribuir manualmente, use a pasta inteira:

- `client-electron/release/0.0.1/win-unpacked/`

Não copie apenas o `.exe`.

## Testes

O projeto possui um executável de testes de gameplay em:

- [GameplayTests.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/tests/GameplayTests.cpp)

Hoje ele valida, entre outros pontos:

- carregamento do conteúdo (`GameConfig`)
- roster atual de `Charizard` e `Hydra`
- kit atual do Hydra
- movimento e colisão
- dano em players e dummies
- absorção de escudo
- auto attack e lifecycle de projéteis
- skill com cooldown e dash
- respawn e payloads de protocolo

## Estado Atual

Hoje o projeto está consolidado neste modelo:

- backend C++ autoritativo
- frontend Electron/React/Pixi
- roster com `Charizard` e `Hydra`
- sistema social completo
- chat privado e chat da arena
- persistência social em PostgreSQL
- arena autoritativa com status, escudo e HUD

Em resumo:

**a arquitetura principal de servidor autoritativo + cliente visual já está estabelecida e o projeto já possui base sólida de gameplay, social e conteúdo.**
