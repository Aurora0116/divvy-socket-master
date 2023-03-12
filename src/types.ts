export enum GameState {
    Busting = 0,
    CoolDown = 1,
    Busted = 2,
}

export interface MultiplierInfo {
    gameState: GameState,
    multiplier: number,
    timeUntilNextGame: number,
    timer: number
}

export interface MultiplierConfig {
    MAX: number,
    MIN: number,
    HOUSE_EDGE: number,
    DECIMAL: number,
    SPEED_SETTING: number,
    COOLDOWN_SETTING: number,
}

export enum BetResult {
    Win = 0,
    Loss = 1,
}

export interface BetHistory {
    game_id: number,
    address: string,
    bet: number,
    payout: number,
    multiplier: number,
    stat: BetResult,
    profit_lost_amount: number,
}

export enum UserWalletState {
    Init = -1,
    Idle = 0,
    Playing = 1,
    Depositing = 2,
    Withdrawing = 3,
    Funding = 4,
    Refunding = 5,
}

export interface WalletConnectionData {
    socket_id: string,
    w_stat: UserWalletState,
    t_bal: number,
    total_wager_amount: number,
    pending_action_amount?: number,
}

/// Redis store data structures
export interface RedisChatData {
    name: string,
    text: string,
    date: number
}

export interface RedisConnectionData {
    [address: string]: WalletConnectionData,
}

export interface RedisGameData {
    game_id: number,
    pubkey: string,
    multiplier: number,
    start_time: number,
    duration: number,
    config: MultiplierConfig
}

export interface RedisBetHistoryData {
    [address: string]: BetHistory
}

export interface RedisCurrentBetData {
    w_addr: string,
    bet: number,
    payout: number,
}