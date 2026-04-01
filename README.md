# Dragon Arena

Dragon Arena roda hoje com uma arquitetura de servidor autoritativo em C++ e cliente desktop em Electron/React/PixiJS.

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
- autenticação, sessões e perfil
- sistema social e chat

Observação importante:

- o respawn automático de players é autoritativo no backend
- o frontend só exibe o countdown visual

### `client-electron/`

Cliente desktop do jogo.

- Shell desktop em Electron
- UI em React + TypeScript
- Renderização da arena em PixiJS
- HUD, seleção de personagem, login, home, overlays sociais e chat em React

Responsabilidades do cliente:

- input local
- câmera
- interpolação visual
- HUD e menus
- feedback visual de skills, projéteis e passivas
- render de mapa, players, dummies e efeitos
- friend list e chats

O cliente não decide gameplay crítico.

## Persistência

O backend possui uma camada de banco em `server-cpp/database/`:

- [Database.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/Database.h)
- [Database.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/Database.cpp)
- [UserRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/UserRepository.h)
- [UserRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/database/UserRepository.cpp)

Essa base usa o cliente nativo do PostgreSQL (`libpq`) e prepara o servidor para autenticação e features sociais sem espalhar SQL pelo resto do projeto.

Hoje ela cobre:

- conexão com PostgreSQL
- `SELECT 1` de validação no startup
- busca de usuário por email
- busca de usuário por username
- busca por email ou username
- criação de usuário
- criação de perfil inicial
- transação para criar usuário + perfil
- relações de amizade em `friendships`
- mensagens privadas em `private_messages`
- mensagens da arena em `arena_messages`
- pedidos pendentes recebidos e enviados
- presença online/offline por socket autenticado

Variáveis de ambiente aceitas:

- `DRAGON_DB_URL` ou `DATABASE_URL`
- `DRAGON_DB_HOST` ou `PGHOST`
- `DRAGON_DB_PORT` ou `PGPORT`
- `DRAGON_DB_NAME` ou `PGDATABASE`
- `DRAGON_DB_USER` ou `PGUSER`
- `DRAGON_DB_PASSWORD` ou `PGPASSWORD`

Defaults do projeto quando nenhuma env é informada:

- host: `127.0.0.1`
- port: `5432`
- database: `dragon_arena`
- user: `dragon_app`

No startup, o servidor tenta:

1. abrir conexão com o banco
2. executar `SELECT 1`
3. contar usuários da tabela `users`

Observações de permissão:

- `public.friendships`, `public.private_messages` e `public.arena_messages` precisam existir no PostgreSQL
- se essas tabelas forem criadas manualmente por um usuário admin, o usuário `dragon_app` também precisa de permissões de `SELECT/INSERT/UPDATE/DELETE`
- o `dragon_app` também precisa de `USAGE/SELECT` nas sequences:
- `public.friendships_id_seq`
- `public.private_messages_id_seq`
- `public.arena_messages_id_seq`

## Sistema Social

O cliente possui uma friend list integrada à tela inicial.

Hoje o fluxo cobre:

- painel `Amigos` no canto inferior direito
- expandir/minimizar painel
- badge de notificações para novos pedidos recebidos
- envio de amizade por `nickname + tag`
- listagem de amigos com nome, tag e status online/offline
- pedidos recebidos com `aceitar` e `recusar`
- modal central para pedidos pendentes enviados
- cancelamento de pedidos enviados
- menu contextual customizado com clique direito em um amigo
- exclusão de amizade com modal de confirmação

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

## Sistema de Chat

O projeto possui dois fluxos de chat integrados ao backend C++.

### Chat privado entre amigos

O chat privado funciona a partir da friend list.

Hoje o fluxo cobre:

- abrir conversa por duplo clique em um amigo
- abrir conversa pelo menu contextual com clique direito
- até 4 conversas abertas ao mesmo tempo
- ao abrir a 5ª, a mais antiga fecha automaticamente
- minimizar, expandir e fechar conversa
- badge de mensagens não lidas por conversa
- badge agregada na barra `Amigos` quando a conversa estiver fechada
- histórico persistido no banco
- sincronização online/offline do amigo na conversa

Backend principal do chat privado:

- [PrivateChatRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/PrivateChatRepository.h)
- [PrivateChatRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/PrivateChatRepository.cpp)
- [NetworkHandler.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/NetworkHandler.h)
- [NetworkHandler.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/NetworkHandler.cpp)

Frontend principal do chat privado:

- [PrivateChatPanel.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/PrivateChatPanel/PrivateChatPanel.tsx)
- [FriendListPanel.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/FriendListPanel/FriendListPanel.tsx)
- [HomeScreen.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/HomeScreen/HomeScreen.tsx)
- [App.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/App.tsx)

### Chat da arena

O chat da arena é sobreposto ao viewport do jogo.

Hoje o fluxo cobre:

- caixa de chat na arena
- `Enter` abre e fecha o input
- com o input aberto, movimento e skills do player ficam bloqueados
- histórico local com até 100 mensagens visíveis
- rolagem manual quando o chat está aberto
- whispers com cor diferente
- mensagens locais usando `Você` via i18n
- dropdown de ajuda ao digitar `/`

Comandos atuais da arena:

- `/add Nick#TAG`
- `/w Nick#TAG mensagem`
- `/r mensagem`

Regras atuais:

- `/add` reutiliza o sistema de amizade
- `/w` envia mensagem privada para amigo
- `/r` responde ao último whisper recebido

Backend principal do chat da arena:

- [ArenaChatRepository.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/ArenaChatRepository.h)
- [ArenaChatRepository.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/social/ArenaChatRepository.cpp)
- [NetworkHandler.h](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/NetworkHandler.h)
- [NetworkHandler.cpp](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/NetworkHandler.cpp)

Frontend principal do chat da arena:

- [ArenaChatBox.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/ArenaChatBox/ArenaChatBox.tsx)
- [ArenaChatBox.css](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/ArenaChatBox/ArenaChatBox.css)
- [Arena.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/Arena.tsx)
- [useArenaNetworkState.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaNetworkState.ts)
- [useSocket.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useSocket.ts)

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
- `props`
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
- friend list integrada à home
- chat privado entre amigos
- chat da arena com comandos
- respawn autoritativo no servidor
- arena renderizada em PixiJS

Em resumo:

**a arquitetura principal de servidor autoritativo + cliente visual já está estabelecida.**
