# 🐉 Dragon Arena

Bem-vindo à nova versão do **Dragon Arena**! O backend foi migrado de Node.js para **C++ (uWebSockets)** para garantir alta performance, baixa latência e melhor escalabilidade. O frontend continua em **React + Electron**, proporcionando uma experiência desktop premium.

---

## 🏗️ Arquitetura do Projeto

O projeto é dividido em dois grandes pilares:

1.  **`server-cpp/`**: O motor do jogo e Fonte da Verdade.
    -   **Networking**: Baseado em `uWebSockets` e `nlohmann/json`.
    -   **Mapas Dinâmicos**: Lê matrizes do Tiled (`.tmj`) e determina colisões absolutas e bounds.
    -   **Lógica**: Sistemas modulares de movimento e combate (Hitboxes).
    -   **Sincronização**: Loop de rede de 1s para eventos passivos (respawn) e broadcast instantâneo para ações de jogadores.
2.  **`client-electron/`**: A interface visual (App/EXE).
    -   **Tecnologias**: React 18, Vite, TypeScript.
    -   **Distribuição**: Empacotado com Electron para rodar como App nativo.

---

## 🚀 Como Rodar o Projeto

### 1. Iniciar o Servidor C++ (`server-cpp`)
Requisitos: Visual Studio 2022 (com C++ Desktop) ou CMake.

1.  Abra a pasta `server-cpp` no Visual Studio.
2.  Aguarde o CMake gerar o cache.
3.  Defina o item de inicialização para `main.cpp` (ou o executável gerado).
4.  Rode em modo **Release** ou **Debug**.
5.  O console dirá: `Servidor Dragon Arena (Modular) rodando na porta 3001`.

### 2. Iniciar o Cliente Electron (`client-electron`)
Requisitos: Node.js (v18+).

1.  Acesse a pasta `client-electron/`.
2.  Instale as dependências: `npm install`.
3.  Configure o arquivo `.env`:
    ```env
    VITE_SERVER_URL=ws://localhost:3001
    ```
4.  Inicie o jogo: `npm run dev`.

---

## 🌍 Mapas Dinâmicos (Server-Authoritative)

A Arena não é mais hardcoded em CSS! O Servidor C++ lê o mapa dinamicamente exportado do **Tiled** e transmite a geometria para o Cliente instanciar os visuais.

Para alterar o Mapa do jogo:
1. Abra o seu Tiled Editor.
2. Desenhe seu mapa utilizando as camadas estritas: `ground` (piso), `walls` (paredes frontais) e `plants` (árvores).
3. Caso queira blocos invisíveis rígidos, pinte a camada `collision`.
4. Plante os `player_spawn` e `dummy_spawn` pela ObjectLayer de `spawns`.
5. Exporte como JSON (`.tmj`) para a pasta `server-cpp/map-assets/tiled/default_map.tmj`.
6. Reinicie o servidor C++. **O executável Cliente dos jogadores montará o novo mapa sozinho ao reconectar!** As hitboxes/colisões estão matematicamente presas à âncora 64x64 nos pés do personagem.

---

## 🛠️ Guia de Customização

### Como Adicionar um Novo Personagem?
1.  **Frontend**: Adicione os metadados em `client-electron/src/config/characters.ts`.
2.  **Backend**: Adicione as estatísticas equivalentes em `server-cpp/GameConfig.h`.
    -   As chaves de ID (ex: `charizard`, `blastoise`) devem ser idênticas nos dois arquivos.

### Como Mudar o Tempo de Respawn?
-   **Dummies**: Altere o valor no método `GameWorld::update` (atualmente 10000ms).
-   **Jogadores**: Altere o `setTimeout` na tela de morte (`Arena.tsx`) ou normalize no backend em `CombatSystem.h`.

---

## 📜 Boas Práticas

-   **Eventos Nomeados**: Sempre use nomes de eventos consistentes entre C++ e TypeScript (ex: `playerMoved`, `dummyDamaged`).
-   **Aceleração de Rede**: O loop de movimento do player roda a ~30ms para suavidade, enquanto o heartbeat do mundo roda a 1s para economizar CPU.
-   **Headers**: Ao modificar sistemas (Movimentação/Combate), sempre limpe o cache do CMake para evitar erros de linkagem.

---
