import axios from 'axios';

import { DB_API_URL } from './constants';
import { ConfigResponseData, WalletResponseData } from './model';
import { UserWalletState } from './types';

export const getWalletInfoByAddress = async (address: string) => {
    try {
        if (!address) return {err: 'Empty address'};
        // console.log(`  -> API Request: get wallet info by address: ${address}`);
        const result = await axios.get(`${DB_API_URL}/moonshot/v1/wallet?wallet_address=${address}`);
        return {result: result.data as WalletResponseData};
    } catch (e) {
        console.log('  -> API Response: ', e);
        return {err: e.msg || e.message || e};
    }
}

export const updateWalletInfoByAddress = async (address: string, data: WalletResponseData) => {
//     wallet_status?: UserWalletState,
//     trading_balance?: number,
//     funding_balance?: number,
//     wager_amount?: number,
// }) => {
    try {
        if (!address) return {err: 'Empty address'};
        // console.log(`  -> API Request: update wallet info by address: ${address}`, data);
        await axios.put(`${DB_API_URL}/moonshot/v1/wallet`, data);
        return {result: 'ok'};
    } catch (e) {
        console.log('  -> API Response: ', e);
        return {err: e.msg || e.message || e};
    }
}

export const getConfigFromDB = async () => {
    try {
        console.log(`--> API Request: get configs`);
        let result = await axios.get(`${DB_API_URL}/moonshot/v1/config`);
        let ret: ConfigResponseData = result.data;
        console.log('  Fetch config success');
        return ret;
    } catch (e) {
        const msg = e.msg || e.message || e;
        console.log('  -> API Response: ', msg);
        return {err: msg};
    }
}