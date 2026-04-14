import axios from 'axios';

// Replace with the IP Address shown in ipconfig, ensure phone and laptop are on same network
const API_URL = 'http://192.168.0.108:5000/api/order';

export const submitOrder = async (ordersArray) => {
    try {
        const response = await axios.post(API_URL, ordersArray);
        return response.data;
    } catch (error) {
        console.error("Error submitting order:", error);
        throw error;
    }
};
