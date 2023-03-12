import redis from 'redis';
import axios from 'axios';
import {
    BetHistory,
    BetResult,
    RedisBetHistoryData,
    RedisChatData,
    RedisConnectionData,
    RedisCurrentBetData,
    RedisGameData,
    WalletConnectionData
} from './types';
import { DB_API_URL, REDIS_CONFIG } from './constants';
import {  } from './model';
import { getWalletInfoByAddress, updateWalletInfoByAddress } from './action';

const redisClient = redis.createClient(REDIS_CONFIG);

export const getRedisConnectionData = async (): Promise<RedisConnectionData> => {
    return new Promise((resolve, reject) => {
        redisClient.get("connections", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(undefined);
            } else {
                const data: RedisConnectionData = JSON.parse(reply);
                resolve(data);
            }
        });
    });
}

export const getRedisBetHistoryData = async (): Promise<RedisBetHistoryData> => {
    return new Promise((resolve, reject) => {
        redisClient.get("bet-histories", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(undefined);
            } else {
                const data: RedisBetHistoryData = JSON.parse(reply);
                resolve(data);
            }
        });
    });
}

export const getRedisGameData = async (): Promise<RedisGameData> => {
    // try {
    //     let result = await axios.get(`${DB_API_URL}/moonshot/v1/keys/game-data`);
    //     let ret = result.data;
    //     return JSON.parse(ret);
    // } catch (e) {
    //     const msg = `Get game data Error: ${e.msg || e.message || e}`;
    //     console.log('  -> Redis Response: ', msg);
    //     return undefined;
    // }
    return new Promise((resolve, reject) => {
        redisClient.get("game-data", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(undefined);
            } else {
                const data: RedisGameData = JSON.parse(reply);
                resolve(data);
            }
        });
    });
}

// export const setRedisGameData = async (data: RedisGameData | undefined): Promise<RedisGameData> => {
//     try {
//         let result = await axios.post(`${DB_API_URL}/moonshot/v1/keys/game-data`, JSON.stringify(data));
//         let ret = result.data;
//         return JSON.parse(ret);
//     } catch (e) {
//         const msg = `Set game data Error: ${e.msg || e.message || e}`;
//         console.log('  -> Redis Response: ', msg);
//         return undefined;
//     }
// }

export const getRedisCurrentBetsData = async (): Promise<RedisCurrentBetData[]> => {
    // try {
    //     let result = await axios.get(`${DB_API_URL}/moonshot/v1/keys/current-bets`);
    //     let ret = result.data;
    //     return JSON.parse(ret);
    // } catch (e) {
    //     const msg = `Get current bets Error: ${e.msg || e.message || e}`;
    //     console.log('  -> Redis Response: ', msg);
    //     return undefined;
    // }
    return new Promise((resolve, reject) => {
        redisClient.get("current-bets", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(undefined);
            } else {
                const data: RedisCurrentBetData[] = JSON.parse(reply);
                resolve(data);
            }
        });
    });
};
// export const setRedisCurrentBetsData = async (data: RedisCurrentBetData[]): Promise<RedisCurrentBetData[]> => {
//     try {
//         let result = await axios.post(`${DB_API_URL}/moonshot/v1/keys/current-bets`, JSON.stringify(data));
//         let ret = result.data;
//         return JSON.parse(ret);
//     } catch (e) {
//         const msg = `Set current bets Error: ${e.msg || e.message || e}`;
//         console.log('  -> Redis Response: ', msg);
//         return undefined;
//     }
// };

export const getRedisChatsData = async (): Promise<RedisChatData[]> => {
    return new Promise((resolve, reject) => {
        redisClient.get("chats", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(undefined);
            } else {
                const data: RedisChatData[] = JSON.parse(reply);
                resolve(data);
            }
        });
    });
};

export const syncRedisDataWithDB = async (user?: string) => {
    if (user) {
        const connectionData = await getRedisConnectionData();
        if (connectionData[user]) {
            const ret = await getWalletInfoByAddress(user);
            if (ret.err) return;
            await updateWalletInfoByAddress(user, {
                ...ret.result,
                wallet_status: connectionData[user].w_stat,
                trading_balance: connectionData[user].t_bal,
                wager_amount: connectionData[user].total_wager_amount,
            });
        }
    } else {

    }
    console.log('  Sync redis data with DB ', user ?? '');
}

/// May don't need if update happens through DB_API later
export const initializeRedisStore = async () => {
    return new Promise(async (resolve, reject) => {
        let value: any = await getRedisChatsData();
        if (!value) redisClient.set("chats", '[]');
        value = await getRedisConnectionData();
        if (!value) redisClient.set("connections", '{}');
        value = await getRedisCurrentBetsData();
        if (!value) redisClient.set("current-bets", '[]');
        // if (!value) setRedisCurrentBetsData([]);
        value = await getRedisGameData();
        if (!value) redisClient.set("game-data", '{}');
        // if (!value) await setRedisGameData(undefined);
        value = await getRedisBetHistoryData();
        if (!value) redisClient.set("bet-histories", '{}');
        resolve(true);
    });
}


/// *** Should update redis data through DB_API later  *** ///

export const updateRedisWalletInfo = async (address: string, data: WalletConnectionData | undefined) => {
    return new Promise((resolve, reject) => {
        redisClient.get("connections", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(false);
            } else {
                let connectionData: RedisConnectionData = JSON.parse(reply);
                connectionData[address] = data;
                redisClient.set("connections", JSON.stringify(connectionData));
                resolve(true);
            }
        });
    })
}

export const addChatHistoryData = async (chat: RedisChatData) => {
    return new Promise((resolve, reject) => {
        redisClient.get("chats", (err, reply) => {
            if (err) {
                console.log('  -> Redis Response: ', err);
                resolve(false);
            } else {
                let chatsData: RedisChatData[] = JSON.parse(reply);
                if (chatsData.length > 99) chatsData.shift();
                chatsData.push(chat);
                redisClient.set("chats", JSON.stringify(chatsData));
            }
        })
    })
}

export const updateRedisForPlaceBet = async (newBet: RedisCurrentBetData) => {
    return new Promise((resolve, reject) => {
        redisClient.get("current-bets", (err, reply) => {
            if (err) {
                console.log(err);
                resolve(false);
            } else {
                let currentPlayersBet: RedisCurrentBetData[] = JSON.parse(reply);

                /// Assert double bet from one user
                for (const bet of currentPlayersBet) {
                    if (bet.w_addr == newBet.w_addr) {
                        resolve(false);
                        return;
                    }
                }
                currentPlayersBet.push(newBet);
                redisClient.set("current-bets", JSON.stringify(currentPlayersBet));
                resolve(true);
            }
        });
    })
}

export const updateRedisForPayout = async (newBet: RedisCurrentBetData) => {
    return new Promise((resolve, reject) => {
        redisClient.get("current-bets", (err, reply) => {
            if (err) {
                console.log(err);
                resolve(false);
            } else {
                let currentPlayersBet: RedisCurrentBetData[] = JSON.parse(reply);

                /// Assert double bet from one user
                for (const idx in currentPlayersBet) {
                    if (currentPlayersBet[idx].w_addr == newBet.w_addr) {
                        currentPlayersBet[idx] = newBet;
                        redisClient.set("current-bets", JSON.stringify(currentPlayersBet));
                        resolve(true);
                        return;
                    }
                } 
                resolve(false);
                return;
            }
        });
    })
}


export const clearRedisForPlaceBet = async () => {
    return new Promise((resolve, reject) => {
        redisClient.get("current-bets", (err, reply) => {
            if (err) {
                console.log(err);
                resolve(false);
            } else {
                redisClient.set("current-bets", JSON.stringify([]));
                resolve(true);
            }
        });
    })
}

// export const addBetHistoryForAllPlayer = async (data: GameData): Promise<BetHistory[]> => {
//     return new Promise((resolve, reject) => {
//         /// Get CurrentPlayersBet Data
//         redisClient.get("current-bets", (err, reply) => {
//             if (err) resolve([]);
//             else {
//                 /// Restore currentPlayersBet Data and clear it when busted
//                 let currentPlayersBet: BetData[] = JSON.parse(reply);
//                 redisClient.set("current-bets", JSON.stringify([]));

//                 /// Update total sum of wagers for all players
//                 redisClient.get("wager-data", async (err, reply) => {
//                     if (err) {
//                         resolve([]);
//                     } else {
//                         let playersTotalWagered: WagerData = JSON.parse(reply) ?? {};
//                         let newBetHistories: BetHistory[] = [];
//                             console.log(playersTotalWagered);
//                         for (const playerData of currentPlayersBet) {
//                             const wager: string = (playersTotalWagered[playerData.address] ?? 0).toString();
//                             let bet: number = playerData.bet;
//                             bet += parseFloat(wager);
//                             playersTotalWagered[playerData.address] = bet;
//                             const newHistory: BetHistory = {
//                                 ...playerData,
//                                 gameId: data.pubkey,
//                                 bustValue: data.multiplier,
//                                 result: data.multiplier > playerData.payout ? BetResult.Win : BetResult.Loss,
//                                 profitOrLostAmount: data.multiplier > playerData.payout ? playerData.bet * data.multiplier : playerData.bet,
//                             }
//                             newBetHistories.push(newHistory);

//                             /// Should call DB API here to store this newHistory in history table
//                             // TODO
                            
//                             /// Should call DB API here to update related user balance
//                             // TODO
//                         }
//                         // redisClient.set("wager-data", JSON.stringify(playersTotalWagered));
//                         resolve(newBetHistories);
//                     }
//                 });
//             }
//         });
//     });
// }