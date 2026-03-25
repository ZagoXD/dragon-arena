import { Server } from 'socket.io';
import * as http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const MAP_WIDTH = 2048;
const MAP_HEIGHT = 1280;
const DUMMY_MAX_HP = 500;

interface Player {
  id: string;
  name: string;
  characterId: string;
  x: number;
  y: number;
  direction: string;
  animRow: number;
  hp: number;
  maxHp: number;
  kills: number;
  deaths: number;
}

interface Dummy {
  id: string;
  x: number;
  y: number;
  hp: number;
}

const players: Record<string, Player> = {};
let dummies: Dummy[] = [
  { id: 'd1', x: MAP_WIDTH / 2 - 200, y: MAP_HEIGHT / 2 - 200, hp: DUMMY_MAX_HP },
  { id: 'd2', x: MAP_WIDTH / 2 + 200, y: MAP_HEIGHT / 2 - 100, hp: DUMMY_MAX_HP },
  { id: 'd3', x: MAP_WIDTH / 2,       y: MAP_HEIGHT / 2 + 250, hp: DUMMY_MAX_HP },
];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (data: any) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name,
      characterId: data.characterId,
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
      direction: 'down',
      animRow: 0,
      hp: data.maxHp,
      maxHp: data.maxHp,
      kills: 0,
      deaths: 0
    };
    socket.broadcast.emit('playerJoined', players[socket.id]);
    socket.emit('currentPlayers', players);
    socket.emit('currentDummies', dummies);
    console.log(`${data.name} joined.`);
  });

  socket.on('respawn', () => {
    const player = players[socket.id];
    if (player) {
      player.hp = player.maxHp;
      player.x = MAP_WIDTH / 2;
      player.y = MAP_HEIGHT / 2;
      io.emit('playerDamaged', { id: socket.id, hp: player.hp });
      socket.broadcast.emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
      console.log(`${player.name} respawned.`);
    }
  });

  socket.on('move', (data: any) => {
    if (players[socket.id]) {
      Object.assign(players[socket.id], data);
      socket.broadcast.emit('playerMoved', { id: socket.id, ...data });
    }
  });

  socket.on('shoot', (data: any) => {
    console.log(`Player ${socket.id} shot at angle ${data.angle}`);
    socket.broadcast.emit('playerShot', { playerId: socket.id, ...data });
  });

  socket.on('dummyDamage', (data: { dummyId: string, damage: number }) => {
    console.log(`Dummy ${data.dummyId} taken ${data.damage} damage`);
    const dummy = dummies.find(d => d.id === data.dummyId);
    if (dummy && dummy.hp > 0) {
      dummy.hp = Math.max(0, dummy.hp - data.damage);
      io.emit('dummyDamaged', { id: dummy.id, hp: dummy.hp });
      
      // Reset dummies logic if all are dead? (Optional, let's just sync for now)
    }
  });

  socket.on('hitPlayer', (data: { targetId: string, attackerId: string, damage: number }) => {
    console.log(`Player ${data.targetId} hit by ${data.attackerId} for ${data.damage} damage`);
    const target = players[data.targetId];
    const attacker = players[data.attackerId];
    
    if (target && target.hp > 0) {
      const oldHp = target.hp;
      target.hp = Math.max(0, target.hp - data.damage);
      
      if (oldHp > 0 && target.hp === 0) {
        target.deaths += 1;
        if (attacker && attacker.id !== target.id) {
          attacker.kills += 1;
        }
        io.emit('playerScored', { 
          victimId: target.id, 
          attackerId: attacker?.id,
          targetKills: target.kills,
          targetDeaths: target.deaths,
          attackerKills: attacker?.kills,
          attackerDeaths: attacker?.deaths
        });
      }
      
      io.emit('playerDamaged', { id: target.id, hp: target.hp });
    }
  });

  socket.on('takeDamage', (data: { amount: number }) => {
    if (players[socket.id]) {
      players[socket.id].hp = Math.max(0, players[socket.id].hp - data.amount);
      io.emit('playerDamaged', { id: socket.id, hp: players[socket.id].hp });
    }
  });

  socket.on('disconnect', () => {
    console.log('User left:', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Dragon Arena Server running on port ${PORT}`);
});
