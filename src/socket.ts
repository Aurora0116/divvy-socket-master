import { Server } from "socket.io"

import {
    RedisCurrentBetData,
    RedisGameData,
    RedisChatData,
    UserWalletState
} from './types';

import {
    getRedisConnectionData,
    getRedisCurrentBetsData,
    getRedisGameData,
    updateRedisWalletInfo,
    getRedisChatsData,
    addChatHistoryData,
    syncRedisDataWithDB,
    updateRedisForPlaceBet,
    updateRedisForPayout
    // updateRedisForPlaceBet,
    // addBetHistoryForAllPlayer,
} from './redis_tool';
import { getConfigFromDB, getWalletInfoByAddress, updateWalletInfoByAddress } from './action';

export const initSocket = (io: Server) => {
    io.on('connection', async (socket) => {
        console.log("--@ Info: New Connection Established");

        // Get current game data when sockect is connected
        getRedisGameData().then((data: RedisGameData | undefined) => {
            console.log("--@ Emit: Current GameData");
            if (data) socket.emit("data", data)
        });

        // Get all current players bets when sockect is connected
        socket.on("get-bets", () => {
            console.log("--> Received: Get All CurrentBetsData");
            getRedisCurrentBetsData().then((data: RedisCurrentBetData[]) => {
                socket.emit("all-bets", data);
            });
        });

        // Get all chat history when socket is connected
        socket.on("get-msgs", () => {
            console.log("--> Received: Get All ChatsData");
            getRedisChatsData().then((data: RedisChatData[]) => {
                socket.emit("all-msgs", data);
            })
        });

        // Login event handler
        socket.on("login", async info => {
            if (info && info.address) {
                console.log('--> Received: Login');
                const ret = await getWalletInfoByAddress(info.address as string);
                if (ret.err) {
                    socket.emit('logged-in', { err: ret.err });
                } else if (ret.result.ID == 0) {
                    socket.emit('logged-in', { err: 'Not registered' });
                } else {
                    const connectionData = await getRedisConnectionData();
                    // console.log(connectionData);

                    const conf: any = await getConfigFromDB();
                    let walletData = {
                        w_stat: ret.result.wallet_status,
                        t_bal: ret.result.trading_balance,
                        // f_bal: ret.result.funding_balance,
                        chat_permit: !conf.err && conf.min_total_wager <= ret.result.wager_amount,
                    }
                    if (connectionData[info.address]) {
                        /// Sync Redis with DB for terminated Connection data
                        syncRedisDataWithDB(info.address);
                        updateRedisWalletInfo(info.address, {
                            ...connectionData[info.address],
                            socket_id: socket.id,
                        });
                        walletData.w_stat = connectionData[info.address].w_stat;
                        walletData.t_bal = connectionData[info.address].t_bal;
                        walletData.chat_permit = !conf.err && conf.min_total_wager <= connectionData[info.address].total_wager_amount;
                    } else {
                        updateRedisWalletInfo(info.address, {
                            socket_id: socket.id,
                            w_stat: ret.result.wallet_status,
                            t_bal: ret.result.trading_balance,
                            total_wager_amount: ret.result.wager_amount,
                        });
                    }
                    socket.emit('logged-in', walletData);
                }
            }
        });

        // Logout event handler
        socket.on("logout", async () => {
            console.log('--> Received: Logout');
            const connectionData = await getRedisConnectionData();
            // console.log(connectionData);
            for (const user of Object.keys(connectionData)) {
                if (connectionData[user].socket_id == socket.id) {
                    console.log('  logout', user);
                    await syncRedisDataWithDB(user);
                    await updateRedisWalletInfo(user, undefined);
                    socket.emit('logged-out', true);
                    return;
                }
            }
            console.log('  never login');
            socket.emit('logged-out', false);
        });

        // Status Change event handler
        socket.on("change-status", async (data: { stat: UserWalletState, address: string }) => {
            console.log('--> Received: Change Status ', data.stat, data.address);
            const connectionData = await getRedisConnectionData();
            if (connectionData[data.address] && connectionData[data.address].socket_id == socket.id) {
                const ret = await updateRedisWalletInfo(data.address, {
                    ...connectionData[data.address],
                    w_stat: data.stat,
                })
                socket.emit('wallet-changed', ret ? { status: data.stat } : { err: 'Redis error' });
            } else {
                console.log(socket.id);
                socket.emit('wallet-changed', { err: 'Invalid Login Info' });
            }
        });

        // Fund event handler
        socket.on("fund", async (data: { address: string, amount: number }) => {
            console.log('--> Received Fund: ', data.address, data.amount);
            const connectionData = await getRedisConnectionData();
            let result = {};
            if (connectionData[data.address] && connectionData[data.address].socket_id == socket.id) {
                if (connectionData[data.address].w_stat != UserWalletState.Idle) result = { status: connectionData[data.address].w_stat, err: 'Wallet status is not Idle' };
                else {
                    // Set redis connection status
                    const updateStatus = async (stat: UserWalletState, err?: string) => {
                        await updateRedisWalletInfo(data.address, {
                            ...connectionData[data.address],
                            w_stat: stat,
                            pending_action_amount: stat == UserWalletState.Idle ? undefined : data.amount,
                        });
                        socket.emit('wallet-changed', { status: stat, err });
                    }
                    await updateStatus(UserWalletState.Funding);
                    const ret = await getWalletInfoByAddress(data.address);
                    if (ret.err) {
                        await updateStatus(UserWalletState.Idle, ret.err);
                        return;
                    } else {
                        // if (ret.result.funding_balance < data.amount) {
                        //     await updateStatus(UserWalletState.Idle, 'Insufficient funding balance');
                        //     return;
                        // }
                        // else {
                        // Update redis balance
                        await updateRedisWalletInfo(data.address, {
                            ...connectionData[data.address],
                            w_stat: UserWalletState.Idle,
                            t_bal: connectionData[data.address].t_bal + data.amount,
                            pending_action_amount: undefined,
                        });
                        // Update DB balance
                        const ret1 = await updateWalletInfoByAddress(data.address, {
                            ...ret.result,
                            wallet_status: UserWalletState.Idle,
                            // funding_balance: ret.result.funding_balance - data.amount,
                            trading_balance: connectionData[data.address].t_bal + data.amount,
                        })
                        if (ret1.err) {
                            await updateStatus(UserWalletState.Idle, ret1.err);
                            return;
                        }
                        // Update FE balance
                        socket.emit('wallet-changed', {
                            status: UserWalletState.Idle,
                            // f_bal: ret.result.funding_balance - data.amount,
                            t_bal: connectionData[data.address].t_bal + data.amount,
                        })
                        return;
                        //     }
                    }
                }
            } else {
                result = { status: UserWalletState.Idle, err: 'Invalid Logged In' };
            }
            socket.emit('wallet-changed', result);
        });

        // Fund event handler
        socket.on("refund", async (data: { address: string, amount: number }) => {
            console.log('--> Received Refund: ', data.address, data.amount);
            const connectionData = await getRedisConnectionData();
            let result = {};
            if (connectionData[data.address] && connectionData[data.address].socket_id == socket.id) {
                if (connectionData[data.address].w_stat != UserWalletState.Idle) {
                    console.log('  Wallet status is not Idle');
                    result = { status: connectionData[data.address].w_stat, err: 'Wallet status is not Idle' };
                }
                else {
                    // Set redis connection status
                    const updateStatus = async (stat: UserWalletState, err?: string) => {
                        await updateRedisWalletInfo(data.address, {
                            ...connectionData[data.address],
                            w_stat: stat,
                            pending_action_amount: stat == UserWalletState.Idle ? undefined : data.amount,
                        });
                        socket.emit('wallet-changed', { status: stat, err });
                    }

                    await updateStatus(UserWalletState.Funding);
                    const ret = await getWalletInfoByAddress(data.address);
                    if (ret.err) {
                        await updateStatus(UserWalletState.Idle, ret.err);
                        return;
                    } else {
                        // if (connectionData[data.address].t_bal < data.amount) {
                        //     await updateStatus(UserWalletState.Idle, 'Insufficient trading balance');
                        //     return;
                        // }
                        // else {
                        // Update redis balance
                        await updateRedisWalletInfo(data.address, {
                            ...connectionData[data.address],
                            w_stat: UserWalletState.Idle,
                            t_bal: connectionData[data.address].t_bal - data.amount,
                            pending_action_amount: undefined,
                        });
                        // Update DB balance
                        const ret1 = await updateWalletInfoByAddress(data.address, {
                            ...ret.result,
                            wallet_status: UserWalletState.Idle,
                            // funding_balance: ret.result.funding_balance + data.amount,
                            trading_balance: connectionData[data.address].t_bal - data.amount,
                        })
                        if (ret1.err) {
                            await updateStatus(UserWalletState.Idle, ret1.err);
                            return;
                        }
                        // Update FE balance
                        socket.emit('wallet-changed', {
                            status: UserWalletState.Idle,
                            // f_bal: ret.result.funding_balance + data.amount,
                            t_bal: connectionData[data.address].t_bal - data.amount,
                        })
                        console.log('  Updated balance ', connectionData[data.address].t_bal - data.amount);
                        return;
                        // }
                    }
                }
            } else {
                result = { status: UserWalletState.Idle, err: 'Invalid Logged In' };
            }
            socket.emit('wallet-changed', result);
            console.log('  ', result);
        });

        // Addbet event handler
        socket.on("add-bet", async (data: { bet: number, payout: number, address: string }) => {
            console.log('--> Received: addBet', data.bet, data.payout, socket.id);
            let connectionData = await getRedisConnectionData(), result = {};
            if (connectionData[data.address] && connectionData[data.address].socket_id == socket.id) {
                if (connectionData[data.address].w_stat != UserWalletState.Playing) {
                    result = { err: 'User status is not Playing' };
                } else if (connectionData[data.address].t_bal < data.bet) {
                    result = { err: 'Insufficient Tranding Balance' };
                } else {
                    connectionData[data.address].t_bal -= data.bet;
                    connectionData[data.address].total_wager_amount += data.bet;

                    // Update redis balance
                    await updateRedisWalletInfo(data.address, connectionData[data.address]);

                    const conf: any = await getConfigFromDB();
                    socket.emit('wallet-changed', {
                        status: UserWalletState.Playing,
                        t_bal: connectionData[data.address].t_bal,
                        chat_permit: !conf.err && conf.min_total_wager <= connectionData[data.address].total_wager_amount,
                    });
                    let newBet: RedisCurrentBetData = {
                        bet: data.bet,
                        payout: data.payout,
                        w_addr: data.address,
                    };
                    const ret = await updateRedisForPlaceBet(newBet);
                    if (!ret) {
                        result = { err: 'Invalid placing bet' };
                    }
                    result = {
                        bet: newBet.bet,
                        payout: newBet.payout,
                        address: newBet.w_addr,
                    }
                    io.emit('new-bet', result);
                }
            } else {
                result = { err: 'Invalid Login Info' };
            }
            socket.emit('placed-bet', result);
        });
        
        //Payout event handler
        socket.on("payout", async (data: { bust: number, address: string }) => {
            console.log('--> Received: Payout', data.bust, socket.id);
            let connectionData = await getRedisConnectionData(), result: any = {};
            if (connectionData[data.address] && connectionData[data.address].socket_id == socket.id) {
                let currentBetData = await getRedisCurrentBetsData();
                let isValidPayout = false;
                for (let betItem of currentBetData) {
                    if (betItem['w_addr'] === data.address) {
                        let betData = betItem;
                        if (data.bust < betItem.payout) {
                            betData.payout = data.bust;
                            const ret = await updateRedisForPayout(betData);
                            if (!ret) result = { err: 'Invalid Payout' };
                            else
                                result = {
                                    bet: betData.bet,
                                    payout: betData.payout,
                                    address: betData.w_addr,
                                }
                            isValidPayout = true;
                        }
                        break;
                    }
                }
                if (!isValidPayout) result = { err: 'Invalid Payout' };
            } else {
                result = { err: 'Invalid Login Info' };
            }
            if (!result.err) console.log('   -> Processed: new_payout -', result.payout);
            else console.log('   -> Error: ', result.err);
            if (result.err) socket.emit('paid-out', result);
            else {
                // socket.emit('paid-out', result);
                io.emit('paid-out', result);
            }
        });

        // New chat message handler
        socket.on("new message", (msg: RedisChatData) => {
            console.log('--> Received: New Message', msg);
            io.emit("msg", msg);
            addChatHistoryData(msg);
        });

        // Remove old socket id when it is disconnected
        socket.on('disconnect', async () => {
            const connectionData = await getRedisConnectionData();
            // console.log(connectionData);
            for (const user of Object.keys(connectionData)) {
                if (connectionData[user].socket_id == socket.id) {
                    console.log('--@ Disconnected ', user);
                    syncRedisDataWithDB(user);
                    updateRedisWalletInfo(user, undefined);
                    return;
                }
            }
            console.log('--@ Disconnected unknown');
        });
    })
}