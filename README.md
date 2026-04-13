# Dragon Arena

Dragon Arena roda hoje com backend autoritativo em C++ e cliente desktop em Electron/React/PixiJS.

O servidor e a fonte de verdade do gameplay e do metadata principal de conteudo. O cliente envia intencao, recebe estado autoritativo e cuida da renderizacao, HUD, camera, menus e feedback visual.

## Arquitetura

### `server-cpp/`

Servidor autoritativo do jogo.

- `uWebSockets` + `nlohmann/json` no networking
- tick autoritativo com snapshots periodicos
- mapas carregados do Tiled
- gameplay carregado por arquivos JSON
- autenticacao, sessao, social e chat no mesmo backend

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

- movimento e colisao autoritativos
- auto attack, skills, passivas e escudos
- projeteis, areas de efeito, dano e status
- spawn e respawn de players e dummies
- matchmaking e instancias de arena
- metadata autoritativo de personagens
- autenticacao e sessao
- friend list, chat privado e chat da arena

### `client-electron/`

Cliente desktop do jogo.

- Electron como shell desktop
- React + TypeScript na interface
- PixiJS na arena
- HUD, menus, overlays sociais e chat em React

Responsabilidades do cliente:

- input local
- camera
- HUD e menus
- render de mapa, players, dummies e efeitos
- feedback visual de skills, projeteis, passivas e escudos
- friend list, chat privado e chat da arena

O cliente nao decide gameplay critico. A montagem de spritesheet dos personagens tambem nao fica mais hardcoded em tabelas locais fixas: as orientacoes de animacao vem do backend.

## Persistencia

O backend usa PostgreSQL via `libpq` em `server-cpp/database/`.

Hoje a persistencia cobre:

- usuarios e perfis
- amizades em `friendships`
- mensagens privadas em `private_messages`
- mensagens da arena em `arena_messages`
- denuncias em `player_reports`
- banimentos em `user_bans`

A fonte central do schema fica em:

- `server-cpp/config/database_schema.sql`

Tabelas esperadas pelo projeto:

- `public.users`
- `public.player_profiles`
- `public.friendships`
- `public.private_messages`
- `public.arena_messages`
- `public.player_reports`
- `public.user_bans`

Configuracoes aceitas pelo backend:

- `DRAGON_DB_URL` ou `DATABASE_URL`
- `DRAGON_DB_HOST` ou `PGHOST`
- `DRAGON_DB_PORT` ou `PGPORT`
- `DRAGON_DB_NAME` ou `PGDATABASE`
- `DRAGON_DB_USER` ou `PGUSER`
- `DRAGON_DB_PASSWORD` ou `PGPASSWORD`
- `DRAGON_DB_AUTO_APPLY_SCHEMA`

Defaults quando nenhuma env e informada:

- host: `127.0.0.1`
- port: `5432`
- database: `dragon_arena`
- user: `dragon_app`
- `autoApplySchema`: `true`

Quando `autoApplySchema` esta ativo, o servidor tenta executar `database_schema.sql` no startup.

Para isso funcionar bem, o usuario configurado no backend precisa:

- conseguir conectar no banco
- ter `USAGE` e `CREATE` no schema `public`
- ser dono das tabelas e sequences existentes se o banco ja tiver sido criado antes por outro usuario

Quando `autoApplySchema` esta desativado, o servidor apenas usa as tabelas ja existentes.

## Sistema Social

Hoje o sistema social cobre:

- painel `Amigos` nas telas autenticadas fora da arena
- envio de amizade por `nickname + tag`
- listagem de amigos com status online e offline
- pedidos recebidos com aceitar e recusar
- pedidos enviados pendentes
- cancelamento de pedidos enviados
- menu contextual customizado
- exclusao de amizade com confirmacao

Arquivos principais:

- `server-cpp/social/FriendshipRepository.h`
- `server-cpp/social/FriendshipRepository.cpp`
- `client-electron/src/components/FriendListPanel/FriendListPanel.tsx`
- `client-electron/src/App.tsx`

## Moderacao e Reports

O projeto possui dois fluxos administrativos integrados ao backend:

- penalizacoes (`ban` / `unban`)
- denuncias de jogadores (`reports`)

### Reports para jogadores

Qualquer jogador autenticado pode abrir o modal `Reportar`:

- pelo botao `Reportar` no menu superior
- pelo comando `/report` dentro da arena

O modal permite:

- informar `nickname + tag`
- selecionar de `1` a `3` motivos
- escrever uma descricao
- validar no envio se o jogador alvo existe
- receber feedback visual de sucesso ou erro

### Painel admin

Admins possuem uma tela `Admin` com duas areas principais:

- `Usuarios`
- `Denuncias`

Hoje a aba `Denuncias` cobre:

- fila de reports abertos
- detalhes da denuncia
- log do chat da arena da ultima `1 hora` do denunciado
- `Recusar denuncia`
- `Aceitar e banir`

Hoje a aba `Usuarios` cobre:

- busca por `nickname + tag`
- dados de conta e perfil
- amizade direta forcada
- `Banir`
- `Desbanir`

Arquivos principais:

- `server-cpp/moderation/ModerationRepository.h`
- `server-cpp/moderation/ModerationRepository.cpp`
- `server-cpp/moderation/ReportRepository.h`
- `server-cpp/moderation/ReportRepository.cpp`
- `client-electron/src/components/AdminScreen/AdminScreen.tsx`
- `client-electron/src/components/ReportModal/ReportModal.tsx`

## Sistema de Chat

O projeto possui dois fluxos de chat integrados ao backend C++.

### Chat privado entre amigos

- abre por duplo clique ou menu contextual
- ate 4 chats privados simultaneos
- ao abrir o quinto, o mais antigo fecha automaticamente
- minimizar, expandir e fechar
- badge por conversa e badge agregada em `Amigos`
- historico persistido no banco

Arquivos principais:

- `server-cpp/social/PrivateChatRepository.h`
- `server-cpp/social/PrivateChatRepository.cpp`
- `client-electron/src/components/PrivateChatPanel/PrivateChatPanel.tsx`

### Chat da arena

- caixa de chat sobreposta ao viewport
- `Enter` abre o input
- com o input aberto, movimento e skills ficam bloqueados
- ate 100 mensagens no historico local do overlay
- rolagem manual com o chat aberto
- whispers com cor diferenciada
- ajuda de comandos ao digitar `/`

Comandos atuais:

- `/add Nick#TAG`
- `/w Nick#TAG mensagem`
- `/r mensagem`
- `/report`

Arquivos principais:

- `server-cpp/social/ArenaChatRepository.h`
- `server-cpp/social/ArenaChatRepository.cpp`
- `client-electron/src/components/ArenaChatBox/ArenaChatBox.tsx`

## Telas do Cliente

Hoje o cliente autenticado possui:

- `Inicio`
- `Perfil`
- `Colecao`
- `Reportar`
- `Modo treino`
- `Jogar`
- `Selecao de personagem`
- `Arena`

Admins tambem possuem:

- `Admin`

## Modos de Jogo

O jogo possui dois fluxos principais de arena:

- `Modo treino`
- `Jogar`

### Modo treino

- cria uma instancia privada da arena
- entra apenas o jogador atual
- usa `training_map`
- possui dummies para teste

### Jogar

- usa pareamento `1x1`
- o personagem e escolhido antes de entrar na fila
- abre overlay de busca de partida
- quando dois jogadores sao encontrados, ambos recebem modal para aceitar ou recusar
- se os dois aceitarem, cada um entra em uma instancia exclusiva da partida
- usa `arena_map`
- a partida dura `5 minutos`
- vence quem tiver mais eliminacoes
- empate em eliminacoes resulta em `empate`
- desconexao durante a partida encerra a match para o oponente

O backend diferencia instancias de `training` e `match`, em vez de tratar toda a arena como um unico mundo compartilhado.

## Gameplay Atual

O gameplay e montado a partir de arquivos em `server-cpp/config/`.

Arquivos principais:

- `server-cpp/config/world.json`
- `server-cpp/config/characters/meteor.json`
- `server-cpp/config/characters/hydra.json`
- `server-cpp/config/passives/burn.json`
- `server-cpp/config/passives/poison.json`

Roster atual:

### Meteor

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
- `Poison`: dano ao longo do tempo + reducao de velocidade
- `Shield`: vida extra temporaria absorvida antes da vida normal
- `Root`: imobilizacao temporaria

## Metadata autoritativo de personagem

Cada personagem possui dois blocos principais no JSON:

- gameplay
- `presentation`

O bloco `presentation` e a fonte de verdade do frontend sobre como a spritesheet deve ser montada. Hoje ele inclui:

- `image`
- `frameWidth`
- `frameHeight`
- `renderScale`
- `directions`
- `animations`

As animacoes atuais ja sao lidas do backend para desenhar:

- arena
- HUD
- selecao de personagem
- colecao
- overlay de troca de personagem dentro da arena

Exemplo simplificado:

```json
{
  "id": "meteor",
  "name": "Meteor",
  "autoAttackSpellId": "ember",
  "skillIds": ["dragon_dive", "flamethrower", "fire_blast"],
  "passiveId": "burn",
  "presentation": {
    "image": "meteor.png",
    "frameWidth": 256,
    "frameHeight": 256,
    "renderScale": 0.5,
    "directions": ["up", "right", "down", "left"],
    "animations": {
      "idle": {
        "up": [0, 4, 8, 12],
        "right": [1, 5, 9, 13],
        "down": [2, 6, 10, 14],
        "left": [3, 7, 11, 15],
        "fps": 8,
        "loop": true
      },
      "walk": {
        "up": [16, 20, 24],
        "right": [17, 21, 25],
        "down": [18, 22, 26],
        "left": [19, 23, 27],
        "fps": 8,
        "loop": true
      }
    }
  }
}
```

Isso deixa o projeto pronto para expansao futura da spritesheet com clips como:

- `attack`
- `hit`
- `death`
- animacoes especificas por skill

sem exigir novo hardcode estrutural no frontend.

## Renderizacao da Arena

Arquivos principais:

- `client-electron/src/components/Arena/Arena.tsx`
- `client-electron/src/components/Arena/PixiArenaView.tsx`
- `client-electron/src/hooks/useSocket.ts`
- `client-electron/src/hooks/useArenaNetworkState.ts`
- `client-electron/src/hooks/useArenaController.ts`

Hoje a arena cobre:

- mapa carregado do Tiled
- players locais e remotos
- dummies
- projeteis
- areas de efeito
- passivas visuais
- barras de vida e escudo sobre os personagens
- HUD com vida, escudo, skills e passiva
- timer visual de partida em matches `1x1`
- tela final de `vitoria`, `derrota` ou `empate`

Fluxo atual de render de personagem:

1. o backend envia `characters`, `spells` e `passives`
2. o frontend resolve os assets locais correspondentes
3. o frontend monta os clips usando `presentation.animations`
4. todas as telas reutilizam esse mesmo metadata autoritativo

Em resumo: o frontend ainda recorta spritesheet em runtime, mas nao decide mais a estrutura desses recortes por tabelas fixas locais do tipo `idleRows` / `walkRows`.

## Mapas

Hoje existem dois mapas principais:

- `server-cpp/map-assets/tiled/training_map.tmj`
- `server-cpp/map-assets/tiled/arena_map.tmj`

Uso atual:

- `training_map`: usado apenas no `Modo treino`
- `arena_map`: usado no matchmaking `1x1`

Spawns esperados hoje:

- `training_map`
  - spawn central de player
  - dummies
- `arena_map`
  - `player_spawn_1`
  - `player_spawn_2`

Camadas usadas hoje:

- `ground`
- `plants`
- `props`
- `Hide`
- `collision`
- `walls`
- `spawns`

O sistema foi organizado para crescer com mais mapas no futuro, mantendo a escolha do mapa no backend.

## Como Rodar

### Banco de dados

O jeito mais simples de preparar uma maquina nova e:

1. instalar PostgreSQL
2. criar o banco `dragon_arena`
3. criar o usuario `dragon_app`
4. conceder permissoes ao `dragon_app`
5. criar `server-cpp/config/database.json`
6. iniciar o servidor com `autoApplySchema: true`

Exemplo de fluxo no `psql`, conectado como `postgres`:

```sql
CREATE DATABASE dragon_arena;
CREATE USER dragon_app WITH PASSWORD 'sua_senha_aqui';
```

Depois conecte no banco:

```sql
\c dragon_arena
```

Conceda as permissoes necessarias para o servidor conseguir aplicar o schema automaticamente:

```sql
GRANT USAGE, CREATE ON SCHEMA public TO dragon_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dragon_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dragon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dragon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dragon_app;
```

Se as tabelas ja existirem e tiverem sido criadas por outro usuario, transfira a ownership para `dragon_app`:

```sql
ALTER TABLE users OWNER TO dragon_app;
ALTER TABLE player_profiles OWNER TO dragon_app;
ALTER TABLE friendships OWNER TO dragon_app;
ALTER TABLE private_messages OWNER TO dragon_app;
ALTER TABLE arena_messages OWNER TO dragon_app;
ALTER TABLE player_reports OWNER TO dragon_app;
ALTER TABLE user_bans OWNER TO dragon_app;
```

Dependendo do historico do banco, tambem pode ser necessario transferir as sequences:

```sql
ALTER SEQUENCE users_id_seq OWNER TO dragon_app;
ALTER SEQUENCE friendships_id_seq OWNER TO dragon_app;
ALTER SEQUENCE private_messages_id_seq OWNER TO dragon_app;
ALTER SEQUENCE arena_messages_id_seq OWNER TO dragon_app;
ALTER SEQUENCE player_reports_id_seq OWNER TO dragon_app;
ALTER SEQUENCE user_bans_id_seq OWNER TO dragon_app;
```

Para descobrir os nomes reais das sequences no seu banco:

```sql
\ds
```

### `database.json`

Crie o arquivo `server-cpp/config/database.json` com algo como:

```json
{
  "host": "127.0.0.1",
  "port": "5432",
  "database": "dragon_arena",
  "user": "dragon_app",
  "password": "sua_senha_aqui",
  "autoApplySchema": true
}
```

Campos principais:

- `host`: host do PostgreSQL
- `port`: porta do PostgreSQL
- `database`: nome do banco
- `user`: usuario que o servidor vai usar
- `password`: senha desse usuario
- `autoApplySchema`: quando `true`, o servidor executa `database_schema.sql` automaticamente no startup

Quando usar cada modo:

- `autoApplySchema: true`
  - use em ambiente novo, local ou sempre que quiser que o servidor garanta a estrutura do banco
- `autoApplySchema: false`
  - use quando o schema ja foi provisionado manualmente e o usuario do backend nao deve alterar estrutura

### Startup esperado do banco

Com `autoApplySchema: true` e permissoes corretas, o log do servidor deve ficar parecido com:

```txt
[Database] Loaded config file: ...
[Database] Connected successfully (...)
[Database] SELECT 1 succeeded.
[Database] Schema executed from: .../config/database_schema.sql
```

O `SELECT 1 succeeded.` e apenas um ping simples para validar que a conexao com o PostgreSQL esta funcionando.

Se o schema falhar no startup, normalmente o motivo sera um destes:

- falta de permissao no schema `public`
- tabelas existentes pertencendo a outro usuario
- arquivo `database_schema.sql` nao encontrado

### Backend

O servidor precisa destes itens no mesmo contexto de execucao:

- `DragonArenaServer.exe`
- pasta `config/`
- pasta `map-assets/`

Estrutura minima esperada:

```txt
server/
  DragonArenaServer.exe
  config/
    world.json
    database.json
    database_schema.sql
    characters/
      meteor.json
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
      training_map.tmj
      arena_map.tmj
```

Observacoes:

- o servidor procura `config/` e `map-assets/tiled/` por caminhos relativos
- `config/database_schema.sql` precisa acompanhar a pasta `config/`

### Cliente em desenvolvimento

Dentro de `client-electron`:

```bash
npm install
npm run dev
```

Por padrao o cliente tenta conectar em:

```txt
ws://localhost:3001
```

Voce pode ajustar isso por `VITE_SERVER_URL`.

### Cliente empacotado

Para distribuir manualmente, use a pasta inteira:

- `client-electron/release/0.0.1/win-unpacked/`

Nao copie apenas o `.exe`.

## Testes

O projeto possui um executavel de testes de gameplay em:

- `server-cpp/tests/GameplayTests.cpp`

Hoje ele valida, entre outros pontos:

- carregamento do conteudo (`GameConfig`)
- roster atual de `Meteor` e `Hydra`
- movimento e colisao
- dano em players e dummies
- absorcao de escudo
- auto attack e lifecycle de projeteis
- skill com cooldown e dash
- respawn e payloads de protocolo
- diferenca entre instancia de treino e instancia de match

## Estado Atual

Hoje o projeto esta consolidado neste modelo:

- backend C++ autoritativo
- frontend Electron/React/Pixi
- roster com `Meteor` e `Hydra`
- metadata autoritativo de personagem vindo do backend
- sistema social completo
- chat privado e chat da arena
- reports de jogador
- moderacao com banimento e desbanimento
- persistencia social em PostgreSQL
- arena autoritativa com status, escudo, HUD e instancias
- modo treino solo
- matchmaking `1x1` com aceite e resultado final

Em resumo:

**a arquitetura principal de servidor autoritativo + cliente visual ja esta estabelecida, com o backend definindo tanto gameplay quanto metadata de personagem e o frontend atuando como renderer desse estado.**
