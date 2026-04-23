import axios from 'axios';

let BASE_URL = 'https://bitespeed-api-santn.loca.lt/api';

// Pass this header for all requests to bypass the Localtunnel IP reminder screen automatically
axios.defaults.headers.common['Bypass-Tunnel-Reminder'] = 'true';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true'; // For ngrok compatibility just in case

export const setApiUrl = (url) => {
    let cleanUrl = url.trim();
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    if (!cleanUrl.endsWith('/api')) cleanUrl += '/api';
    if (!cleanUrl.startsWith('http')) cleanUrl = 'http://' + cleanUrl;
    BASE_URL = cleanUrl;
};

export const getApiUrl = () => BASE_URL;

export const submitOrder = async (ordersArray) => {
    try {
        const response = await axios.post(`${BASE_URL}/order`, ordersArray);
        return response.data;
    } catch (error) {
        console.error("Error submitting order:", error);
        throw error;
    }
};

export const registerUser = async (username, password, type) => {
    try {
        const response = await axios.post(`${BASE_URL}/register`, { username, password, type });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Registration failed' };
    }
};

export const loginUser = async (username, password) => {
    try {
        const response = await axios.post(`${BASE_URL}/login`, { username, password });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Login failed' };
    }
};

export const getDemand = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/demand`);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Fetching demand failed' };
    }
};
export const getHistory = async (username) => {
    try {
        const response = await axios.get(`${BASE_URL}/history/${username}`);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Fetching history failed' };
    }
};
