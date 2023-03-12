import express from 'express';
import http from 'http';
import cors from 'cors';
import redis from 'redis';
import { Server } from 'socket.io';
import { RedisGameData, GameState, MultiplierInfo, RedisCurrentBetData, UserWalletState } from './types';
import { REDIS_CONFIG } from "./constants";
import { getMultiplierFromTime } from './util';
import { initSocket } from './socket';
import { clearRedisForPlaceBet, getRedisConnectionData, getRedisCurrentBetsData, initializeRedisStore, updateRedisForPlaceBet, updateRedisWalletInfo } from './redis_tool';

const subscriber = redis.createClient(REDIS_CONFIG);
const app = express();

app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('<h1>Weclome to divvy</h1>');
});

// Init Socket Handlers
initSocket(io);

// Redis subscriber for generating new game data
subscriber.on("message", (channel, message) => {
  console.log('--> Subscriber: new game data');
  console.log(message);
  const data: RedisGameData = JSON.parse(message);
  io.emit("data", data);
  let time = 0;
  const interval = setInterval(async () => {
    const value = getMultiplierFromTime(time, { HE: data.config.HOUSE_EDGE, SP: data.config.SPEED_SETTING });
    let multiplier: MultiplierInfo = {
      gameState: GameState.Busting,
      multiplier: 0,
      timer: 0,
      timeUntilNextGame: 0,
    };
    if (value > data.multiplier || time > data.duration) {
      multiplier.gameState = GameState.Busted;
      multiplier.multiplier = data.multiplier;
      multiplier.timeUntilNextGame = data.config.COOLDOWN_SETTING;
      io.emit("multiplier", multiplier);
      const currentPlayersBet = await getRedisCurrentBetsData();
      if (currentPlayersBet && currentPlayersBet.length > 0) {
        let connectionData = await getRedisConnectionData();
        currentPlayersBet.map((playerBet: RedisCurrentBetData) => {
          if (playerBet.payout >= multiplier.multiplier) return;
          if (connectionData[playerBet.w_addr] && connectionData[playerBet.w_addr].w_stat == UserWalletState.Playing) {
            updateRedisWalletInfo(playerBet.w_addr, {
              ...connectionData[playerBet.w_addr],
              t_bal: connectionData[playerBet.w_addr].t_bal + playerBet.bet * playerBet.payout, // Should consider the House edge later
            })
            io.to(connectionData[playerBet.w_addr].socket_id).emit('wallet-changed', {
              status: UserWalletState.Playing,
              t_bal: connectionData[playerBet.w_addr].t_bal + playerBet.bet * playerBet.payout,
            })
          }
        });
        await clearRedisForPlaceBet();
      }
      clearInterval(interval);
      startCoolDown(data.config.COOLDOWN_SETTING);
      return;
    }
    multiplier.multiplier = value;
    multiplier.timer = time;
    io.emit("multiplier", multiplier);
    time += 0.1;
  }, 100);
})

const startCoolDown = (cooldown: number) => {
  let time = cooldown;
  let multiplier: MultiplierInfo = {
    gameState: GameState.CoolDown,
    multiplier: 0,
    timer: 0,
    timeUntilNextGame: cooldown,
  }
  const interval = setInterval(() => {
    if (time <= 0) {
      multiplier.timeUntilNextGame = 0;
      io.emit("multiplier", multiplier);
      clearInterval(interval);
      return;
    }
    multiplier.timeUntilNextGame = time;
    io.emit("multiplier", multiplier);
    time -= 0.115;
  }, 100);
}

server.listen(8083, async () => {
  await initializeRedisStore();
  subscriber.subscribe("new-game");
  console.log('--@ Start: Listening on http://localhost:8083');
});
