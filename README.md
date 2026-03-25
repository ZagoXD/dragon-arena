# Dragon Arena Multiplayer

Um jogo de batalha em arena multiplayer em tempo real, com autoridade do servidor, construído com **React**, **Socket.io** e **Electron**.
Um jogo de batalha em arena multiplayer em tempo real, com autoridade do servidor, construído com **React**, **Socket.io** e **Electron**.

## Funcionalidades

- **Combate em Tempo Real**: Sistema de auto-ataque veloz com sincronização de projéteis.
- **Rede Multiplayer**: Integrado com Socket.io para baixa latência de movimento e estado de combate.
- **Progresso Persistente**: Acompanhamento de Kills (Abates) e Deaths (Mortes) com um Placar em tempo real (Pressione **Tab**).
- **Renascer Automático (Auto-Respawn)**: Sistema de morte com contagem regressiva de 5 segundos e retorno automático à batalha.
- **Jogo em Segundo Plano**: O loop do jogo permanece ativo mesmo quando minimizado ou em uma aba em segundo plano (Heartbeat baseado em Web Worker).
- **Multiplataforma**: Execute como um aplicativo de desktop (Electron) ou em qualquer navegador web moderno.
- **Excelência Visual**: Estética premium com animações suaves, barras de vida e um HUD dinâmico.

## Tecnologias Utilizadas

- **Frontend**: React 18, Vite, TypeScript.
- **Backend**: Node.js, Socket.io, tsx.
- **Desktop**: Electron (Wrapper nativo).
- **Estilização**: CSS Vanilla com efeitos modernos (Glassmorphism, Blurs).

## Como Rodar o Projeto

### 1. Requisitos
Certifique-se de ter o **Node.js** instalado em sua máquina.

### 2. Instalação
Clone o repositório e instale as dependências:
```bash
npm install
```

### 3. Iniciar o Servidor (Backend)
Em um terminal, execute o servidor Socket.io:
```bash
npm run server
```

### 4. Iniciar o Cliente (Frontend)
Em outro terminal, você pode escolher como rodar o jogo:

**Para rodar no Navegador:**
```bash
npm run dev
```
Acesse `http://localhost:5173` no seu navegador.

**Para rodar via Electron (Desktop):**
```bash
npm run dev
```
(O comando `dev` iniciará tanto o servidor de desenvolvimento do Vite quanto a janela do Electron).

## Como Jogar

1. **Escolha seu Dragão**: Digite seu nome e escolha um dos personagens disponíveis.
2. **Movimentação**: Use **WASD** ou as **Setas** do teclado para se mover.
3. **Combate**: Use o **Botão Esquerdo do Mouse** para disparar ataques na direção do cursor.
4. **Alvos**: Você pode atacar Dummies de treino ou outros jogadores conectados.
5. **Placar**: Segure a tecla **Tab** para ver o ranking da arena.
6. **Morte e Renascimento**: Se sua vida chegar a zero, seu personagem desaparecerá e você renascerá no centro do mapa após 5 segundos.

## Estrutura do Projeto

- `/server`: Lógica do servidor autoritativo.
- `/src/components`: Componentes de interface (Arena, Player, Projectile, HUD, Scoreboard).
- `/src/hooks`: Lógica de estado e rede customizada.
- `/src/config`: Definições de personagens e magias.
- `/electron`: Configuração da janela Desktop.

---
Divirta-se na Arena! 🐲🔥
