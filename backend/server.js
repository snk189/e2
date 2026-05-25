const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const DATA_FILE = path.join(__dirname, '../ml/data1.csv');
const USERS_FILE = path.join(__dirname, '../users/users.csv');
const PENDING_USERS_FILE = path.join(__dirname, '../users/pending_users.csv');
const BLOCKED_USERS_FILE = path.join(__dirname, '../users/blocked_users.csv');
const REJECTED_USERS_FILE = path.join(__dirname, '../users/rejected_users.csv');
const MANAGEMENT_SETTINGS_FILE = path.join(__dirname, 'management_settings.json');

const defaultSettings = {
    is_holiday: 0,
    is_bridge_day: 0,
    season: 'winter',
    temperature_celsius: 25.0,
    weather: 'sunny',
    is_exam_week: 0
};

const PYTHON_EXEC = "C:/Python313/python.exe";
const SCRIPT_PATH = path.join(__dirname, '../ml/get_predictions.py');

// Initialize files
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "username,password,type\n");
if (!fs.existsSync(PENDING_USERS_FILE)) fs.writeFileSync(PENDING_USERS_FILE, "username,password,type\n");
if (!fs.existsSync(BLOCKED_USERS_FILE)) fs.writeFileSync(BLOCKED_USERS_FILE, "username\n");
if (!fs.existsSync(REJECTED_USERS_FILE)) fs.writeFileSync(REJECTED_USERS_FILE, "username,reject_count,timestamp\n");
if (!fs.existsSync(MANAGEMENT_SETTINGS_FILE)) fs.writeFileSync(MANAGEMENT_SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));

// Background Model Evaluation Cache
let cachedDemand = null;
let isModelRunning = false;

// ----------------------------------------------------
// LOGGER MIDDLEWARE
// ----------------------------------------------------
const LOG_FILE = path.join(__dirname, 'api_logs.txt');
app.use((req, res, next) => {
    if (req.method === 'OPTIONS' || req.url.includes('/api/demand')) {
        return next();
    }
    const timestamp = new Date().toISOString();
    // Try to extract user from custom header first, but ignore if it's 'Unknown_User'
    let user = req.headers['x-api-user'];
    if (!user || user === 'Unknown_User') {
        user = req.body?.username || req.query?.username || req.params?.username || 'Unknown_User';
    }
    const logEntry = `[${timestamp}] USER: ${user} | METHOD: ${req.method} | ENDPOINT: ${req.url}\n`;

    fs.appendFile(LOG_FILE, logEntry, (err) => {
        if (err) console.error("Failed to write to log file:", err);
    });
    next();
});

// Logout endpoint for logging
app.post('/api/logout', (req, res) => {
    res.status(200).json({ message: 'Logged out successfully' });
});

// Function to run the AI Model in the background
const runModelBackground = () => {
    if (isModelRunning) return; // Prevent overlapping runs
    
    console.log("Dataset change detected. Running AI model in the background...");
    isModelRunning = true;
    
    exec(`"${PYTHON_EXEC}" "${SCRIPT_PATH}"`, (error, stdout, stderr) => {
        isModelRunning = false;
        if (error) {
            console.error("Background AI Model Error:", error);
            return;
        }
        try {
            cachedDemand = JSON.parse(stdout);
            console.log("AI Model successfully updated predictions caching.");
        } catch (e) {
            console.error("Failed to parse background AI output:", e);
        }
    });
};

// Initial run at server startup
runModelBackground();

// Setup File Watcher on data1.csv to detect ANY change
if (fs.existsSync(DATA_FILE)) {
    let debounceTimer;
    fs.watch(DATA_FILE, (eventType, filename) => {
        if (filename && eventType === 'change') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                runModelBackground();
            }, 500); 
        }
    });
}

// ----------------------------------------------------
// COOLDOWN & BLOCK LOGIC
// ----------------------------------------------------
const checkCooldown = (username) => {
    if (fs.existsSync(BLOCKED_USERS_FILE)) {
        const blockedData = fs.readFileSync(BLOCKED_USERS_FILE, 'utf8');
        const blockedLines = blockedData.split('\n');
        for (let i = 1; i < blockedLines.length; i++) {
            if (blockedLines[i].trim() === username) {
                return { blocked: true, cooldownMsg: 'Your account has been permanently blocked.' };
            }
        }
    }

    if (fs.existsSync(REJECTED_USERS_FILE)) {
        const rejectedData = fs.readFileSync(REJECTED_USERS_FILE, 'utf8');
        const rejectedLines = rejectedData.split('\n');
        for (let i = 1; i < rejectedLines.length; i++) {
            const line = rejectedLines[i].trim();
            if (line) {
                const [storedUser, countStr, timestampStr] = line.split(',');
                if (storedUser === username) {
                    const count = parseInt(countStr, 10);
                    const rejectTime = parseInt(timestampStr, 10);
                    const now = Math.floor(Date.now() / 1000);
                    const diffDays = (now - rejectTime) / (60 * 60 * 24);
                    
                    if (count >= 3) {
                        if (diffDays < 30) {
                            const daysLeft = Math.ceil(30 - diffDays);
                            return { blocked: true, cooldownMsg: `Rejected 3 times. Wait ${daysLeft} day(s).` };
                        }
                    } else {
                        if (diffDays < 1) {
                            const hoursLeft = Math.ceil((1 - diffDays) * 24);
                            return { blocked: true, cooldownMsg: `Registration rejected. Wait ${hoursLeft} hour(s).` };
                        }
                    }
                }
            }
        }
    }
    return { blocked: false, cooldownMsg: null };
};

const incrementRejectCount = (username) => {
    const data = fs.readFileSync(REJECTED_USERS_FILE, 'utf8');
    const lines = data.split('\n');
    let found = false;
    const remaining = [lines[0]];
    const now = Math.floor(Date.now() / 1000);
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [storedUser, countStr] = line.split(',');
            if (storedUser === username) {
                found = true;
                const newCount = parseInt(countStr, 10) + 1;
                remaining.push(`${username},${newCount},${now}`);
            } else {
                remaining.push(line);
            }
        }
    }
    if (!found) {
        remaining.push(`${username},1,${now}`);
    }
    fs.writeFileSync(REJECTED_USERS_FILE, remaining.join('\n') + '\n');
};

const clearRejectedStatus = (username) => {
    const data = fs.readFileSync(REJECTED_USERS_FILE, 'utf8');
    const lines = data.split('\n');
    const remaining = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [storedUser] = line.split(',');
            if (storedUser !== username) {
                remaining.push(line);
            }
        }
    }
    fs.writeFileSync(REJECTED_USERS_FILE, remaining.join('\n') + '\n');
};

const unfreezeRejectedStatus = (username) => {
    const data = fs.readFileSync(REJECTED_USERS_FILE, 'utf8');
    const lines = data.split('\n');
    const remaining = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [storedUser, countStr] = line.split(',');
            if (storedUser === username) {
                // Keep the strike count but reset timestamp to 0 so cooldown ends
                remaining.push(`${username},${countStr},0`);
            } else {
                remaining.push(line);
            }
        }
    }
    fs.writeFileSync(REJECTED_USERS_FILE, remaining.join('\n') + '\n');
};

// ----------------------------------------------------
// REGULAR ENDPOINTS
// ----------------------------------------------------

app.post('/api/order', (req, res) => {
    try {
        const orders = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ error: 'Expected an array of orders.' });
        }

        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, "user_id,date,item,time_slot,quantity,order_timestamp,is_holiday,is_bridge_day,season,temperature_celsius,weather,is_exam_week,is_prebooking,prebooking_datetime,is_delivered,status,instructions\n");
        }

        let mlDatasetData = "";
        
        orders.forEach(order => {
            const {
                username, item, time_slot, quantity, timestamp, is_prebooking, prebooking_date, prebooking_time, notes, status
            } = order;
            
            const ts = timestamp || Math.floor(Date.now() / 1000);
            const dObj = new Date(ts * 1000);
            const dateStr = [('0' + dObj.getDate()).slice(-2), ('0' + (dObj.getMonth() + 1)).slice(-2), dObj.getFullYear()].join('-');
            
            // Read from management settings
            let settings = { ...defaultSettings };
            try {
                if (fs.existsSync(MANAGEMENT_SETTINGS_FILE)) {
                    settings = JSON.parse(fs.readFileSync(MANAGEMENT_SETTINGS_FILE, 'utf8'));
                }
            } catch (e) {
                console.error('Error reading settings:', e);
            }
            const { is_holiday, is_bridge_day, season, temperature_celsius, weather, is_exam_week } = settings;
            
            let pb_dt = '';
            // Handle both boolean true and integer 1
            const isPrebook = is_prebooking === 1 || is_prebooking === true;
            
            if (isPrebook) {
                const pbObj = new Date(`${prebooking_date}T${prebooking_time}`);
                pb_dt = Math.floor(pbObj.getTime() / 1000);
                
                const hour = pbObj.getHours();
                if (hour < 8 || hour >= 18) {
                    throw new Error("Canteen operates between 8 AM and 6 PM.");
                }
            }
            
            mlDatasetData += `${username},${dateStr},${item},${time_slot},${quantity},${ts},${is_holiday},${is_bridge_day},${season},${temperature_celsius},${weather},${is_exam_week},${isPrebook ? 1 : 0},${pb_dt},False,${status || 'pending'},${(notes || '').replace(/,/g, ' ')}\n`;
        });

        fs.appendFileSync(DATA_FILE, mlDatasetData);
        runModelBackground(); // Trigger AI update when new data arrives
        
        res.status(200).json({ message: 'Orders received successfully' });
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.get('/api/history/:username', (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) return res.status(200).json([]);
        
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const lines = data.split('\n');
        const history = [];
        
        // Fetch last 50 orders globally since user_orders.csv is deprecated
        for (let i = lines.length - 1; i >= 1 && history.length < 50; i--) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                if (parts.length >= 14 && parts[0] === req.params.username) {
                    if (parseInt(parts[4]) === 0) continue; // Skip zero-quantity orders
                    history.push({
                        item: parts[2],
                        time_slot: parseInt(parts[3]),
                        quantity: parseInt(parts[4]),
                        timestamp: parseInt(parts[5]),
                        is_prebooking: parseInt(parts[12]) === 1,
                        prebooking_datetime: parts[13] ? parseInt(parts[13]) : null,
                        is_delivered: parts[14] === 'True',
                        status: parts[15] ? parts[15].trim() : (parts[14] === 'True' ? 'delivered' : 'pending'),
                        notes: parts.length > 16 ? parts[16].trim() : ''
                    });
                }
            }
        }
        res.status(200).json(history);
    } catch (error) {
        console.error('Error reading history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.post('/api/register', (req, res) => {
    try {
        const { username, password, type } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
        
        const cooldownStatus = checkCooldown(username);
        if (cooldownStatus.blocked) {
            return res.status(403).json({ error: cooldownStatus.cooldownMsg });
        }
        
        // Clear old rejected status if cooldown expired
        clearRejectedStatus(username);

        let userType = 'n';
        if (type === 'm') userType = 'm';
        if (type === 'a') userType = 'a';

        const data = fs.readFileSync(USERS_FILE, 'utf8');
        if (data.split('\n').some(line => line.trim() && line.split(',')[0] === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const pendingData = fs.readFileSync(PENDING_USERS_FILE, 'utf8');
        if (pendingData.split('\n').some(line => line.trim() && line.split(',')[0] === username)) {
            return res.status(400).json({ error: 'A request for this username is already pending approval' });
        }

        fs.appendFileSync(PENDING_USERS_FILE, `${username},${password},${userType}\n`);
        res.status(202).json({ message: 'Registration request sent. Waiting for admin approval.', type: userType });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

        const cooldownStatus = checkCooldown(username);
        if (cooldownStatus.blocked) {
            return res.status(403).json({ error: cooldownStatus.cooldownMsg });
        }

        const data = fs.readFileSync(USERS_FILE, 'utf8');
        const lines = data.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [storedUser, storedPass, storedType] = line.split(',');
                if (storedUser === username && storedPass === password) {
                    return res.status(200).json({ message: 'Login successful', username, type: storedType });
                }
            }
        }
        res.status(401).json({ error: 'Invalid username or password' });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: 'Failed to login' });
    }
});

app.get('/api/admin/settings', (req, res) => {
    try {
        if (!fs.existsSync(MANAGEMENT_SETTINGS_FILE)) return res.status(200).json(defaultSettings);
        const data = fs.readFileSync(MANAGEMENT_SETTINGS_FILE, 'utf8');
        res.status(200).json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/admin/settings', (req, res) => {
    try {
        const newSettings = req.body;
        // Validate or merge
        const mergedSettings = { ...defaultSettings, ...newSettings };
        fs.writeFileSync(MANAGEMENT_SETTINGS_FILE, JSON.stringify(mergedSettings, null, 2));
        res.status(200).json({ message: 'Settings updated successfully', settings: mergedSettings });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.get('/api/demand', (req, res) => {
    try {
        if (cachedDemand) {
            return res.status(200).json(cachedDemand);
        } else {
            return res.status(202).json({ error: 'AI Model is currently training in the background. Please try again in a few seconds.' });
        }
    } catch (error) {
        console.error('Error getting demand:', error);
        res.status(500).json({ error: 'Failed to get demand data' });
    }
});

// ----------------------------------------------------
// ORDERS MANAGEMENT ENDPOINTS
// ----------------------------------------------------

app.get('/api/admin/today_orders', (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) return res.status(200).json([]);
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const lines = data.split('\n');
        
        // Define today's range based on effective time
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
        const endOfDay = startOfDay + 86400;

        const todayOrders = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                if (parseInt(parts[4]) === 0) continue; // Skip zero-quantity orders
                const is_prebooking = parseInt(parts[12]) === 1;
                const effective_time = is_prebooking && parts[13] ? parseInt(parts[13]) : parseInt(parts[5]);
                
                if (effective_time >= startOfDay && effective_time < endOfDay) {
                    todayOrders.push({
                        id: i,
                        username: parts[0],
                        item: parts[2],
                        quantity: parseInt(parts[4]),
                        order_timestamp: parseInt(parts[5]),
                        is_prebooking: is_prebooking,
                        prebooking_datetime: parts[13] ? parseInt(parts[13]) : null,
                        effective_time: effective_time,
                        is_delivered: parts[14] === 'True',
                        status: parts[15] ? parts[15].trim() : (parts[14] === 'True' ? 'delivered' : 'pending'),
                        notes: parts.length > 16 ? parts[16].trim() : ''
                    });
                }
            }
        }

        todayOrders.sort((a, b) => a.effective_time - b.effective_time);
        res.status(200).json(todayOrders);
    } catch (error) {
        console.error('Error fetching today orders:', error);
        res.status(500).json({ error: 'Failed to fetch today orders' });
    }
});

app.get('/api/admin/orders_by_date', (req, res) => {
    try {
        const queryDateStr = req.query.date;
        const queryUsername = req.query.username;
        
        if (!queryDateStr && !queryUsername) return res.status(400).json({ error: 'Date or username is required' });
        
        if (!fs.existsSync(DATA_FILE)) return res.status(200).json([]);
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const lines = data.split('\n');
        
        let startOfDay, endOfDay;
        if (queryDateStr) {
            const [year, month, day] = queryDateStr.split('-');
            startOfDay = new Date(year, month - 1, day).getTime() / 1000;
            endOfDay = startOfDay + 86400;
        }

        const dateOrders = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                if (parseInt(parts[4]) === 0) continue;
                const is_prebooking = parseInt(parts[12]) === 1;
                const effective_time = is_prebooking && parts[13] ? parseInt(parts[13]) : parseInt(parts[5]);
                
                const matchesUsername = queryUsername ? (parts[0] === queryUsername) : true;
                const matchesDate = queryDateStr ? (effective_time >= startOfDay && effective_time < endOfDay) : true;
                
                if (matchesUsername && matchesDate) {
                    dateOrders.push({
                        id: i,
                        username: parts[0],
                        item: parts[2],
                        quantity: parseInt(parts[4]),
                        order_timestamp: parseInt(parts[5]),
                        is_prebooking: is_prebooking,
                        prebooking_datetime: parts[13] ? parseInt(parts[13]) : null,
                        effective_time: effective_time,
                        is_delivered: parts[14] === 'True',
                        status: parts[15] ? parts[15].trim() : (parts[14] === 'True' ? 'delivered' : 'pending'),
                        notes: parts.length > 16 ? parts[16].trim() : '',
                        dateStr: parts[1] // Original order date string
                    });
                }
            }
        }

        dateOrders.sort((a, b) => a.effective_time - b.effective_time);
        res.status(200).json(dateOrders);
    } catch (error) {
        console.error('Error fetching orders by date:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

app.post('/api/admin/update_order_status', (req, res) => {
    try {
        const { id, is_delivered, status } = req.body;
        const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
        if (id >= 1 && id < lines.length) {
            const parts = lines[id].split(',');
            parts[14] = is_delivered ? 'True' : 'False';
            if (status) {
                parts[15] = status;
            } else {
                parts[15] = is_delivered ? 'delivered' : 'pending';
            }
            lines[id] = parts.join(',');
            fs.writeFileSync(DATA_FILE, lines.join('\n'));
            res.status(200).json({ message: 'Order status updated successfully' });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// ----------------------------------------------------
// ADMIN PENDING/APPROVE/REJECT ENDPOINTS
// ----------------------------------------------------

app.get('/api/pending_users', (req, res) => {
    try {
        if (!fs.existsSync(PENDING_USERS_FILE)) return res.status(200).json([]);
        const data = fs.readFileSync(PENDING_USERS_FILE, 'utf8');
        const pendingUsers = data.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const [username, password, type] = line.split(',');
            return { username, type };
        });
        res.status(200).json(pendingUsers);
    } catch (error) {
        console.error('Error fetching pending users:', error);
        res.status(500).json({ error: 'Failed to fetch pending users' });
    }
});

app.post('/api/approve_user', (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const lines = fs.readFileSync(PENDING_USERS_FILE, 'utf8').split('\n');
        let userToApprove = null;
        const remainingPending = [lines[0]];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                if (line.split(',')[0] === username) userToApprove = line;
                else remainingPending.push(line);
            }
        }

        if (!userToApprove) return res.status(404).json({ error: 'Pending user not found' });

        fs.appendFileSync(USERS_FILE, `${userToApprove}\n`);
        fs.writeFileSync(PENDING_USERS_FILE, remainingPending.join('\n') + '\n');
        
        clearRejectedStatus(username);
        res.status(200).json({ message: 'User approved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

app.post('/api/reject_user', (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const lines = fs.readFileSync(PENDING_USERS_FILE, 'utf8').split('\n');
        let userFound = false;
        const remainingPending = [lines[0]];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                if (line.split(',')[0] === username) userFound = true;
                else remainingPending.push(line);
            }
        }

        if (!userFound) return res.status(404).json({ error: 'Pending user not found' });

        fs.writeFileSync(PENDING_USERS_FILE, remainingPending.join('\n') + '\n');
        incrementRejectCount(username);

        res.status(200).json({ message: 'User rejected successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

// ----------------------------------------------------
// NEW ADMIN ENDPOINTS
// ----------------------------------------------------

app.get('/api/admin/users', (req, res) => {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        const users = data.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const [username, password, type] = line.split(',');
            return { username, type };
        });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/admin/add_user', (req, res) => {
    try {
        const { username, password, type } = req.body;
        if (!username || !password || !type) return res.status(400).json({ error: 'Missing fields' });

        const data = fs.readFileSync(USERS_FILE, 'utf8');
        if (data.split('\n').some(line => line.trim() && line.split(',')[0] === username)) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        fs.appendFileSync(USERS_FILE, `${username},${password},${type}\n`);
        clearRejectedStatus(username);
        res.status(200).json({ message: 'User added successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add user' });
    }
});

app.post('/api/admin/change_password', (req, res) => {
    try {
        const { username, newPassword } = req.body;
        if (!username || !newPassword) return res.status(400).json({ error: 'Username and new password are required' });

        const lines = fs.readFileSync(USERS_FILE, 'utf8').split('\n');
        let found = false;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                if (parts[0] === username) {
                    parts[1] = newPassword;
                    lines[i] = parts.join(',');
                    found = true;
                    break;
                }
            }
        }

        if (!found) return res.status(404).json({ error: 'User not found' });
        fs.writeFileSync(USERS_FILE, lines.join('\n'));
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

app.post('/api/admin/remove_user', (req, res) => {
    try {
        const { username } = req.body;
        const lines = fs.readFileSync(USERS_FILE, 'utf8').split('\n');
        const remaining = [lines[0]];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() && lines[i].split(',')[0] !== username) {
                remaining.push(lines[i]);
            }
        }
        fs.writeFileSync(USERS_FILE, remaining.join('\n') + '\n');
        res.status(200).json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

app.post('/api/admin/block_user', (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        const blockedData = fs.readFileSync(BLOCKED_USERS_FILE, 'utf8');
        if (!blockedData.split('\n').some(l => l.trim() === username)) {
            fs.appendFileSync(BLOCKED_USERS_FILE, `${username}\n`);
        }

        // Remove from users.csv
        const userLines = fs.readFileSync(USERS_FILE, 'utf8').split('\n');
        const remUsers = [userLines[0]];
        for (let i = 1; i < userLines.length; i++) {
            if (userLines[i].trim() && userLines[i].split(',')[0] !== username) remUsers.push(userLines[i]);
        }
        fs.writeFileSync(USERS_FILE, remUsers.join('\n') + '\n');

        // Remove from pending_users.csv
        const pLines = fs.readFileSync(PENDING_USERS_FILE, 'utf8').split('\n');
        const remP = [pLines[0]];
        for (let i = 1; i < pLines.length; i++) {
            if (pLines[i].trim() && pLines[i].split(',')[0] !== username) remP.push(pLines[i]);
        }
        fs.writeFileSync(PENDING_USERS_FILE, remP.join('\n') + '\n');

        res.status(200).json({ message: 'User blocked completely' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to block user' });
    }
});

app.post('/api/admin/unblock_user', (req, res) => {
    try {
        const { username } = req.body;
        const lines = fs.readFileSync(BLOCKED_USERS_FILE, 'utf8').split('\n');
        const remaining = [lines[0]];
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() && lines[i].trim() !== username) {
                remaining.push(lines[i]);
            }
        }
        fs.writeFileSync(BLOCKED_USERS_FILE, remaining.join('\n') + '\n');
        res.status(200).json({ message: 'User unblocked' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

app.get('/api/admin/blocked_users', (req, res) => {
    try {
        const data = fs.readFileSync(BLOCKED_USERS_FILE, 'utf8');
        const blocked = data.split('\n').slice(1).filter(l => l.trim()).map(username => ({ username }));
        res.status(200).json(blocked);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch blocked users' });
    }
});

app.get('/api/admin/rejected_users', (req, res) => {
    try {
        const data = fs.readFileSync(REJECTED_USERS_FILE, 'utf8');
        const rejected = data.split('\n').slice(1).filter(l => l.trim()).map(line => {
            const [username, count, timestamp] = line.split(',');
            return { username, count: parseInt(count, 10), timestamp: parseInt(timestamp, 10) };
        });
        res.status(200).json(rejected);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rejected users' });
    }
});

app.post('/api/admin/unfreeze_user', (req, res) => {
    try {
        const { username } = req.body;
        unfreezeRejectedStatus(username);
        res.status(200).json({ message: 'User unfrozen' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unfreeze user' });
    }
});

app.get('/api/admin/recent_data', (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) return res.status(200).json([]);
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const lines = data.split('\n');
        const recent = [];
        // fetch last 100 entries
        for (let i = lines.length - 1; i >= 1 && recent.length < 100; i--) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                recent.push({
                    id: i, // use line index as ID for deletion
                    username: parts[0],
                    item: parts[2],
                    time_slot: parts[3],
                    quantity: parts[4],
                    timestamp: parts[5]
                });
            }
        }
        res.status(200).json(recent);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recent data' });
    }
});

app.post('/api/admin/remove_data', (req, res) => {
    try {
        const { id } = req.body; // id is the line index
        const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
        if (id >= 1 && id < lines.length) {
            lines.splice(id, 1);
            fs.writeFileSync(DATA_FILE, lines.join('\n'));
            runModelBackground(); // Trigger AI update when data is removed
            res.status(200).json({ message: 'Datapoint removed' });
        } else {
            res.status(404).json({ error: 'Datapoint not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove datapoint' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
