# 🐉 Dragon Arena: C++ Migration MVP

Bem-vindo à nova versão do **Dragon Arena**! O backend foi migrado de Node.js para **C++ (uWebSockets)** para garantir alta performance, baixa latência e melhor escalabilidade. O frontend continua em **React + Electron**, proporcionando uma experiência desktop premium.

---

## 🏗️ Arquitetura do Projeto

O projeto é dividido em dois grandes pilares:

1.  **`server-cpp/`**: O motor do jogo.
    -   **Networking**: Baseado em `uWebSockets` e `nlohmann/json`.
    -   **Lógica**: Sistemas modulares de movimento e combate.
    -   **Sincronização**: Loop de rede de 1s para eventos passivos (respawn) e broadcast instantâneo para ações de jogadores.
2.  **`client-electron/`**: A interface visual.
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
