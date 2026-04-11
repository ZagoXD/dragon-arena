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
- spawn e respawn de players e dummies
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

- usuarios e perfis
- amizades em `friendships`
- mensagens privadas em `private_messages`
- mensagens da arena em `arena_messages`
- denuncias em `player_reports`
- banimentos e desbanimentos em `user_bans`
- pedidos pendentes recebidos e enviados
- presença online e offline via socket autenticado

A fonte central do schema fica em:

- `server-cpp/config/database_schema.sql`

Tabelas atuais esperadas pelo projeto:

- `public.users`
- `public.player_profiles`
- `public.friendships`
- `public.private_messages`
- `public.arena_messages`
- `public.player_reports`
- `public.user_bans`

Configurações aceitas pelo backend:

- `DRAGON_DB_URL` ou `DATABASE_URL`
- `DRAGON_DB_HOST` ou `PGHOST`
- `DRAGON_DB_PORT` ou `PGPORT`
- `DRAGON_DB_NAME` ou `PGDATABASE`
- `DRAGON_DB_USER` ou `PGUSER`
- `DRAGON_DB_PASSWORD` ou `PGPASSWORD`
- `DRAGON_DB_AUTO_APPLY_SCHEMA`

Defaults quando nenhuma env é informada:

- host: `127.0.0.1`
- port: `5432`
- database: `dragon_arena`
- user: `dragon_app`
- `autoApplySchema`: `true`

Quando `autoApplySchema` está ativo, o servidor tenta executar `database_schema.sql` no startup.

Para isso funcionar bem, o usuário configurado no backend precisa:

- conseguir conectar no banco
- ter `USAGE` e `CREATE` no schema `public`
- ser dono das tabelas e sequences existentes se o banco já tiver sido criado antes por outro usuário

Quando `autoApplySchema` está desativado, o servidor apenas usa as tabelas já existentes.

## Sistema Social

Hoje o sistema social cobre:

- painel `Amigos` no canto inferior direito das telas autenticadas fora da arena
- envio de amizade por `nickname + tag`
- listagem de amigos com status online e offline
- pedidos recebidos com aceitar e recusar
- modal central de pedidos enviados pendentes
- cancelamento de pedidos enviados
- menu contextual customizado no clique direito
- exclusão de amizade com confirmação

Arquivos principais:

- `server-cpp/social/FriendshipRepository.h`
- `server-cpp/social/FriendshipRepository.cpp`
- `client-electron/src/components/FriendListPanel/FriendListPanel.tsx`
- `client-electron/src/App.tsx`

## Moderação e Reports

O projeto possui dois fluxos administrativos integrados ao backend:

- penalizações (`ban` / `unban`)
- denúncias de jogadores (`reports`)

### Reports para jogadores

Qualquer jogador autenticado pode abrir o modal `Reportar`:

- pelo botão `Reportar` no menu superior
- pelo comando `/report` dentro da arena

O modal permite:

- informar `nickname + tag`
- selecionar de `1` a `3` motivos
- escrever uma descrição
- validar no envio se o jogador alvo existe
- receber feedback visual de sucesso ou erro

### Painel admin

Admins possuem uma tela `Admin` com duas áreas principais:

- `Usuários`
- `Denúncias`

Hoje a aba `Denúncias` cobre:

- fila de reports abertos
- detalhes da denúncia
- log do chat da arena da última `1 hora` do denunciado
- `Recusar denúncia`
- `Aceitar e banir`

Hoje a aba `Usuários` cobre:

- busca por `nickname + tag`
- dados de conta e perfil
- amizade direta forçada
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

- abre por duplo clique ou pelo menu contextual
- até 4 chats privados simultâneos
- ao abrir o quinto, o mais antigo fecha automaticamente
- minimizar, expandir e fechar
- badge por conversa e badge agregada em `Amigos`
- histórico persistido no banco

Arquivos principais:

- `server-cpp/social/PrivateChatRepository.h`
- `server-cpp/social/PrivateChatRepository.cpp`
- `client-electron/src/components/PrivateChatPanel/PrivateChatPanel.tsx`

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
- `/report`

Ao abrir o chat da arena ou o modal de `report`, movimento e skills do personagem ficam bloqueados até o fechamento da interface.

Arquivos principais:

- `server-cpp/social/ArenaChatRepository.h`
- `server-cpp/social/ArenaChatRepository.cpp`
- `client-electron/src/components/ArenaChatBox/ArenaChatBox.tsx`

## Telas do Cliente

Hoje o cliente autenticado possui:

- `Início`
- `Perfil`
- `Coleção`
- `Reportar`
- `Modo treino`
- `Jogar` com pareamento
- `Seleção de personagem`
- `Arena`

Admins também possuem:

- `Admin`

O menu superior com `Início`, `Perfil`, `Coleção` e configurações fica disponível nas telas autenticadas fora da arena.

## Modos de Jogo

O jogo possui dois fluxos principais de arena:

- `Modo treino`
- `Jogar`

### Modo treino

- cria uma instancia privada da arena
- entra apenas o jogador atual
- mantém o loop livre para testar personagem, movimentação e skills

### Jogar

- usa pareamento `1x1`
- o personagem é escolhido antes de entrar na fila
- abre overlay de busca de partida
- quando dois jogadores são encontrados, ambos recebem um modal global para aceitar ou recusar
- se os dois aceitarem, cada um entra em uma instancia exclusiva daquela partida
- a partida dura `5 minutos`
- vence quem tiver mais eliminacoes
- empate em eliminacoes resulta em `empate`
- desconexao durante a partida encerra a match para o oponente

O backend diferencia instancias de `training` e `match`, em vez de tratar toda a arena como um unico mundo compartilhado.

Arquivos principais:

- `client-electron/src/App.tsx`
- `client-electron/src/components/HomeScreen/HomeScreen.tsx`
- `client-electron/src/components/ProfileScreen/ProfileScreen.tsx`
- `client-electron/src/components/CollectionScreen/CollectionScreen.tsx`
- `client-electron/src/components/SelectScreen/SelectScreen.tsx`

## Gameplay Atual

O gameplay é montado a partir de arquivos em `server-cpp/config/`.

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
- `Poison`: dano ao longo do tempo + redução de velocidade
- `Shield`: vida extra temporária absorvida antes da vida normal
- `Root`: imobilização temporária

## Renderização da Arena

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

## Mapa

O mapa principal é:

- `server-cpp/map-assets/tiled/default_map.tmj`

Camadas usadas hoje:

- `ground`
- `plants`
- `props`
- `collision`
- `walls`
- `spawns`

## Como Rodar

### Banco de dados

O jeito mais simples de preparar uma máquina nova é:

1. instalar PostgreSQL
2. criar o banco `dragon_arena`
3. criar o usuario `dragon_app`
4. conceder permissões ao `dragon_app`
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

Conceda as permissões necessárias para o servidor conseguir aplicar o schema automaticamente:

```sql
GRANT USAGE, CREATE ON SCHEMA public TO dragon_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dragon_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dragon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dragon_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dragon_app;
```

Se as tabelas já existirem e tiverem sido criadas por outro usuário, transfira a ownership para `dragon_app`:

```sql
ALTER TABLE users OWNER TO dragon_app;
ALTER TABLE player_profiles OWNER TO dragon_app;
ALTER TABLE friendships OWNER TO dragon_app;
ALTER TABLE private_messages OWNER TO dragon_app;
ALTER TABLE arena_messages OWNER TO dragon_app;
ALTER TABLE player_reports OWNER TO dragon_app;
ALTER TABLE user_bans OWNER TO dragon_app;
```

Dependendo do histórico do banco, também pode ser necessário transferir as sequences:

```sql
ALTER SEQUENCE users_id_seq OWNER TO dragon_app;
ALTER SEQUENCE friendships_id_seq OWNER TO dragon_app;
ALTER SEQUENCE private_messages_id_seq OWNER TO dragon_app;
ALTER SEQUENCE arena_messages_id_seq OWNER TO dragon_app;
ALTER SEQUENCE player_reports_id_seq OWNER TO dragon_app;
ALTER SEQUENCE user_bans_id_seq OWNER TO dragon_app;
```

Se quiser descobrir os nomes reais das sequences no seu banco:

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
- `user`: usuário que o servidor vai usar
- `password`: senha desse usuario
- `autoApplySchema`: quando `true`, o servidor executa `database_schema.sql` automaticamente no startup

Quando usar cada modo:

- `autoApplySchema: true`
  Use em ambiente novo, ambiente local ou sempre que quiser que o servidor garanta a estrutura do banco.
- `autoApplySchema: false`
  Use quando o schema já foi provisionado manualmente e o usuário do backend não deve alterar estrutura.

### Startup esperado do banco

Com `autoApplySchema: true` e permissões corretas, o log do servidor deve ficar parecido com:

```txt
[Database] Loaded config file: ...
[Database] Connected successfully (...)
[Database] SELECT 1 succeeded.
[Database] Schema executed from: .../config/database_schema.sql
```

O `SELECT 1 succeeded.` é só um ping simples para validar que a conexão com o PostgreSQL está funcionando.

Se o schema falhar no startup, normalmente o motivo será um destes:

- falta de permissão no schema `public`
- tabelas existentes pertencendo a outro usuário
- arquivo `database_schema.sql` não encontrado

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
      default_map.tmj
```

Observações:

- o servidor procura `config/` e `map-assets/tiled/default_map.tmj` por caminhos relativos
- o arquivo `config/database_schema.sql` tambem precisa acompanhar a pasta `config/`

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

Você pode ajustar isso por `VITE_SERVER_URL`.

### Cliente empacotado

Para distribuir manualmente, use a pasta inteira:

- `client-electron/release/0.0.1/win-unpacked/`

Não copie apenas o `.exe`.

## Testes

O projeto possui um executavel de testes de gameplay em:

- `server-cpp/tests/GameplayTests.cpp`

Hoje ele valida, entre outros pontos:

- carregamento do conteúdo (`GameConfig`)
- roster atual de `Meteor` e `Hydra`
- kit atual do Hydra
- movimento e colisao
- dano em players e dummies
- absorção de escudo
- auto attack e lifecycle de projeteis
- skill com cooldown e dash
- respawn e payloads de protocolo
- diferença entre instância de treino e instância de match
- payloads de rejeição também usados pelos fluxos sociais e de report

O suporte de testes e stubs também acompanha os repositórios sociais e de moderação usados pelo `NetworkHandler`, incluindo `ban` e `report`.

## Estado Atual

Hoje o projeto está consolidado neste modelo:

- backend C++ autoritativo
- frontend Electron/React/Pixi
- roster com `Meteor` e `Hydra`
- sistema social completo
- chat privado e chat da arena
- reports de jogador
- moderacao com banimento e desbanimento
- persistencia social em PostgreSQL
- arena autoritativa com status, escudo, HUD e instancias
- modo treino solo
- matchmaking `1x1` com aceite e resultado final

Em resumo:

**a arquitetura principal de servidor autoritativo + cliente visual já está estabelecida e o projeto já possui base sólida de gameplay, social e conteúdo.**
