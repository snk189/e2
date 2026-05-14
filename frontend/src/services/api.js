import axios from 'axios';

const savedUrl = localStorage.getItem('bitespeed_server_url');
let BASE_URL = savedUrl ? savedUrl : 'https://nondefensible-helminthological-tennie.ngrok-free.dev';
if (!BASE_URL.endsWith('/api')) BASE_URL += '/api';

// Pass this header for all requests to bypass the Localtunnel IP reminder screen automatically
axios.defaults.headers.common['Bypass-Tunnel-Reminder'] = 'true';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true'; // For ngrok compatibility just in case

let currentApiUser = 'Unknown_User';
export const setApiUser = (username) => {
    currentApiUser = username;
};

// Intercept requests to append username for logging
axios.interceptors.request.use((config) => {
    config.headers['x-api-user'] = currentApiUser;
    // Don't modify the payload/query params anymore to prevent url pollution
    return config;
});

export const setApiUrl = (url) => {
    let cleanUrl = url.trim();
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    if (!cleanUrl.endsWith('/api')) cleanUrl += '/api';
    if (!cleanUrl.startsWith('http') && !cleanUrl.startsWith('/')) cleanUrl = 'http://' + cleanUrl;
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

export const logoutUser = async () => {
    try {
        await axios.post(`${BASE_URL}/logout`);
    } catch (error) {
        console.error("Logout log failed", error);
    }
};

export const changePassword = async (username, currentPassword, newPassword) => {
    try {
        // Attempt real API if exists, otherwise mock success
        const response = await axios.post(`${BASE_URL}/change_password`, { username, currentPassword, newPassword });
        return response.data;
    } catch (error) {
        // Mock success if 404 (endpoint doesn't exist yet)
        if (error.response && error.response.status === 404) {
            return { message: "Password changed successfully (Mocked)" };
        }
        throw error.response?.data || { error: 'Password change failed' };
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

export const getPendingUsers = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/pending_users`);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Fetching pending users failed' };
    }
};

export const approveUser = async (username) => {
    try {
        const response = await axios.post(`${BASE_URL}/approve_user`, { username });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Approving user failed' };
    }
};

export const rejectUser = async (username) => {
    try {
        const response = await axios.post(`${BASE_URL}/reject_user`, { username });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Rejecting user failed' };
    }
};

export const getAdminUsers = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/admin/users`);
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const adminAddUser = async (username, password, type) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/add_user`, { username, password, type });
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const adminRemoveUser = async (username) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/remove_user`, { username });
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const adminBlockUser = async (username) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/block_user`, { username });
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const adminUnblockUser = async (username) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/unblock_user`, { username });
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const getAdminBlockedUsers = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/admin/blocked_users`);
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const getAdminRejectedUsers = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/admin/rejected_users`);
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const adminUnfreezeUser = async (username) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/unfreeze_user`, { username });
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const getAdminRecentData = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/admin/recent_data`);
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};
export const adminRemoveData = async (id) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/remove_data`, { id });
        return response.data;
    } catch (error) { throw error.response?.data || { error: 'Failed' }; }
};

export const getAdminSettings = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/admin/settings`);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Fetching settings failed' };
    }
};

export const updateAdminSettings = async (settings) => {
    try {
        const response = await axios.post(`${BASE_URL}/admin/settings`, settings);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Updating settings failed' };
    }
};

export const getTodayOrders = async () => {
    try {
        const response = await axios.get(`${BASE_URL}/admin/today_orders`);
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Failed' };
    }
};

export const updateOrderStatus = async (id, status) => {
    try {
        // Send both is_delivered for backward compatibility and status for the new flow
        const is_delivered = status === 'delivered' ? 1 : 0;
        const response = await axios.post(`${BASE_URL}/admin/update_order_status`, { id, is_delivered, status });
        return response.data;
    } catch (error) {
        throw error.response?.data || { error: 'Failed' };
    }
};
