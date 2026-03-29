# Dragon Arena

Dragon Arena agora roda com uma arquitetura de **servidor autoritativo em C++** e **cliente desktop em Electron**.

O backend é responsável pela verdade do gameplay. O frontend recebe estado, renderiza o mundo e cuida da experiência visual.

## Arquitetura

### `server-cpp/`

Servidor autoritativo do jogo.

- Networking em `uWebSockets` + `nlohmann/json`
- Config de gameplay em `config/gameplay.json`
- Mapa carregado de `map-assets/tiled/default_map.tmj`
- Tick autoritativo, snapshots e eventos de sessão
- Sistemas separados por domínio:
  - `SkillSystem`
  - `ProjectileSystem`
  - `DashSystem`
  - `RespawnSystem`
  - `CombatSystem`
  - `WorldSetup`
  - `WorldTickRunner`
  - `WorldSnapshotBuilder`

Responsabilidades do backend:

- spawn e respawn de players e dummies
- movimento autoritativo
- colisão com mapa
- auto attacks e skills
- projéteis, dano, kill/death
- snapshots do mundo
- scoreboard autoritativo
- bootstrap da sessão

### `client-electron/`

Cliente desktop do jogo.

- Shell desktop em Electron
- UI em React + TypeScript
- Renderização do mundo em PixiJS
- HUD, seleção de personagem, nome e overlays em React

Responsabilidades do cliente:

- input local
- câmera
- feedback visual
- HUD e menus
- interpolação/apresentação visual
- render do mapa, players, dummies, projéteis e efeitos

O cliente **não decide gameplay crítico**. Ele envia intenção e responde ao estado do servidor.

## Fluxo de Rede

O fluxo principal hoje é:

1. o cliente conecta no servidor
2. recebe `sessionInit`
3. inicializa bootstrap, mapa e snapshot inicial
4. passa a consumir snapshots/eventos autoritativos
5. envia somente intenções como `move`, `shoot`, `useSkill` e `respawn`

## Estrutura de Renderização

No frontend, a arena está dividida assim:

- [App.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/App.tsx): fluxo de telas
- [Arena.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/Arena.tsx): composição da arena
- [useSocket.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useSocket.ts): transporte e eventos
- [useArenaNetworkState.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaNetworkState.ts): estado autoritativo consumido pela arena
- [useArenaController.ts](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/hooks/useArenaController.ts): input, câmera, aiming e fluxo local
- [PixiArenaView.tsx](C:/Users/gugu_/Documents/github/dragon-arena/client-electron/src/components/Arena/PixiArenaView.tsx): renderização do mundo em Pixi

## Configuração de Gameplay

O gameplay do servidor é carregado de:

- [gameplay.json](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/config/gameplay.json)

Lá ficam:

- personagens
- spells
- timings
- hp
- velocidade
- collider
- respawn
- dimensões base do mundo

Se quiser mudar valores reais de gameplay, o lugar correto é o backend/config.

## Mapa

O mapa é exportado do Tiled e lido pelo backend em:

- [default_map.tmj](C:/Users/gugu_/Documents/github/dragon-arena/server-cpp/map-assets/tiled/default_map.tmj)

Camadas usadas hoje:

- `ground`
- `plants`
- `collision`
- `walls`
- `spawns`

O cliente recebe os dados do mapa do servidor e monta a parte visual localmente.

## Como Rodar

### Backend

O servidor precisa destes itens no mesmo contexto de execução:

- `DragonArenaServer.exe`
- pasta `config/` com `gameplay.json`
- pasta `map-assets/`

Estrutura esperada:

```txt
server/
  DragonArenaServer.exe
  config/
    gameplay.json
  map-assets/
    tiled/
      default_map.tmj
```

Observação:

- o servidor procura `config/gameplay.json` e `map-assets/tiled/default_map.tmj` por caminhos relativos

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

O app Electron empacotado **não é só o `.exe`**.

Para distribuir manualmente, use a pasta inteira:

- `client-electron/release/0.0.1/win-unpacked/`

Ela contém:

- executável
- DLLs do Electron
- `resources/`
- `app.asar`

Se copiar só o `.exe`, o cliente não roda corretamente.

Observação importante:

- o cliente empacotado ainda depende de um backend acessível
- hoje ele não sobe o servidor C++ sozinho

## Estado Atual da Arquitetura

Hoje o projeto está organizado neste modelo:

- backend C++ como fonte da verdade
- frontend React/Electron/Pixi como camada de apresentação
- gameplay separado de visual
- mapa e conteúdo carregados de arquivos
- protocolo de sessão consolidado
- arena renderizada em Pixi

Em outras palavras:

**a arquitetura principal de servidor autoritativo + cliente visual já está consolidada.**
