const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const db = require('./db');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const MANAGEMENT_SETTINGS_FILE = path.join(__dirname, '../management_settings.json');

const defaultSettings = {
    is_holiday: 0,
    is_bridge_day: 0,
    season: 'winter',
    temperature_celsius: 25.0,
    weather: 'sunny',
    is_exam_week: 0
};

const PYTHON_EXEC = "C:/Python313/python.exe";
const SCRIPT_PATH = path.join(__dirname, '../get_predictions.py');

if (!fs.existsSync(MANAGEMENT_SETTINGS_FILE)) fs.writeFileSync(MANAGEMENT_SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));

// Background Model Evaluation Cache
let cachedDemand = null;
let isModelRunning = false;

// Function to run the AI Model in the background
const runModelBackground = () => {
    if (isModelRunning) return;

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

// ----------------------------------------------------
// COOLDOWN & BLOCK LOGIC
// ----------------------------------------------------
const checkCooldown = async (username) => {
    const res = await db.query('SELECT status, reject_count, reject_timestamp FROM users WHERE username = $1', [username]);
    if (res.rows.length === 0) return { blocked: false, cooldownMsg: null };

    const user = res.rows[0];
    if (user.status === 'blocked') {
        return { blocked: true, cooldownMsg: 'Your account has been permanently blocked.' };
    }

    if (user.status === 'rejected') {
        const count = user.reject_count;
        const rejectTime = parseInt(user.reject_timestamp, 10);
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

// ----------------------------------------------------
// REGULAR ENDPOINTS
// ----------------------------------------------------

app.post('/api/order', async (req, res) => {
    try {
        const orders = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ error: 'Expected an array of orders.' });
        }

        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, "user_id,date,item,time_slot,quantity,order_timestamp,is_holiday,is_bridge_day,season,temperature_celsius,weather,is_exam_week,is_prebooking,prebooking_datetime,is_delivered,status\n");
        }

        let mlDatasetData = "";

        orders.forEach(order => {
            const {
                username, item, time_slot, quantity, timestamp, is_prebooking, prebooking_date, prebooking_time
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

            mlDatasetData += `${username},${dateStr},${item},${time_slot},${quantity},${ts},${is_holiday},${is_bridge_day},${season},${temperature_celsius},${weather},${is_exam_week},${isPrebook ? 1 : 0},${pb_dt},False,pending\n`;
        });

        fs.appendFileSync(DATA_FILE, mlDatasetData);
        runModelBackground(); // Trigger AI update when new data arrives

        res.status(200).json({ message: 'Orders received successfully' });
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.get('/api/history/:username', async (req, res) => {
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
                if (parts.length >= 14 && parts[0].trim() === req.params.username.trim()) {
                    if (parseInt(parts[4], 10) === 0) continue; // Skip zero-quantity orders
                    history.push({
                        item: parts[2],
                        time_slot: parseInt(parts[3]),
                        quantity: parseInt(parts[4]),
                        timestamp: parseInt(parts[5]),
                        is_prebooking: parseInt(parts[12]) === 1,
                        prebooking_datetime: parts[13] ? parseInt(parts[13]) : null,
                        is_delivered: parts[14] === 'True',
                        status: parts[15] ? parts[15].trim() : (parts[14] === 'True' ? 'delivered' : 'pending')
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

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, type } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

        const cooldownStatus = await checkCooldown(username);
        if (cooldownStatus.blocked) {
            return res.status(403).json({ error: cooldownStatus.cooldownMsg });
        }

        let userType = 'n';
        if (type === 'm') userType = 'm';
        if (type === 'a') userType = 'a';

        const checkRes = await db.query('SELECT status FROM users WHERE username = $1', [username]);
        if (checkRes.rows.length > 0) {
            const status = checkRes.rows[0].status;
            if (status === 'active') return res.status(400).json({ error: 'Username already exists' });
            if (status === 'pending') return res.status(400).json({ error: 'A request for this username is already pending approval' });
        }

        await db.query(
            `INSERT INTO users (username, password, type, status, reject_count, reject_timestamp) 
             VALUES ($1, $2, $3, 'pending', 0, 0)
             ON CONFLICT (username) DO UPDATE SET password = $2, type = $3, status = 'pending', reject_count = 0, reject_timestamp = 0`,
            [username, password, userType]
        );

        res.status(202).json({ message: 'Registration request sent. Waiting for admin approval.', type: userType });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

        const cooldownStatus = await checkCooldown(username);
        if (cooldownStatus.blocked) {
            return res.status(403).json({ error: cooldownStatus.cooldownMsg });
        }

        const resDb = await db.query('SELECT * FROM users WHERE username = $1 AND password = $2 AND status = $3', [username, password, 'active']);
        if (resDb.rows.length > 0) {
            return res.status(200).json({ message: 'Login successful', username, type: resDb.rows[0].type });
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

app.get('/api/admin/today_orders', async (req, res) => {
    try {
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
                        status: parts[15] ? parts[15].trim() : (parts[14] === 'True' ? 'delivered' : 'pending')
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

app.post('/api/admin/update_order_status', async (req, res) => {
    try {
        const { id, is_delivered, status } = req.body;
        const lines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
        if (id >= 1 && id < lines.length) {
            const parts = lines[id].split(',');
            parts[14] = is_delivered ? 'True' : 'False';
            parts[15] = status || (is_delivered ? 'delivered' : 'pending');
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

app.get('/api/pending_users', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT username, type FROM users WHERE status = 'pending'");
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching pending users:', error);
        res.status(500).json({ error: 'Failed to fetch pending users' });
    }
});

app.post('/api/approve_user', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const result = await db.query("UPDATE users SET status = 'active', reject_count = 0, reject_timestamp = 0 WHERE username = $1 AND status = 'pending' RETURNING username", [username]);
        if (result.rowCount > 0) {
            res.status(200).json({ message: 'User approved successfully' });
        } else {
            res.status(404).json({ error: 'Pending user not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

app.post('/api/reject_user', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const now = Math.floor(Date.now() / 1000);
        const result = await db.query("UPDATE users SET status = 'rejected', reject_count = reject_count + 1, reject_timestamp = $1 WHERE username = $2 AND status = 'pending' RETURNING username", [now, username]);

        if (result.rowCount > 0) {
            res.status(200).json({ message: 'User rejected successfully' });
        } else {
            res.status(404).json({ error: 'Pending user not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

// ----------------------------------------------------
// NEW ADMIN ENDPOINTS
// ----------------------------------------------------

app.get('/api/admin/users', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT username, type FROM users WHERE status = 'active'");
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/admin/add_user', async (req, res) => {
    try {
        const { username, password, type } = req.body;
        if (!username || !password || !type) return res.status(400).json({ error: 'Missing fields' });

        const checkRes = await db.query('SELECT username FROM users WHERE username = $1', [username]);
        if (checkRes.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        await db.query("INSERT INTO users (username, password, type, status) VALUES ($1, $2, $3, 'active')", [username, password, type]);
        res.status(200).json({ message: 'User added successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add user' });
    }
});

app.post('/api/admin/remove_user', async (req, res) => {
    try {
        const { username } = req.body;
        await db.query("DELETE FROM users WHERE username = $1 AND status = 'active'", [username]);
        res.status(200).json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

app.post('/api/admin/block_user', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });

        await db.query("INSERT INTO users (username, password, type, status) VALUES ($1, 'dummy', 'n', 'blocked') ON CONFLICT (username) DO UPDATE SET status = 'blocked'", [username]);
        res.status(200).json({ message: 'User blocked completely' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to block user' });
    }
});

app.post('/api/admin/unblock_user', async (req, res) => {
    try {
        const { username } = req.body;
        await db.query("DELETE FROM users WHERE username = $1 AND status = 'blocked'", [username]);
        res.status(200).json({ message: 'User unblocked' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

app.get('/api/admin/blocked_users', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT username FROM users WHERE status = 'blocked'");
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch blocked users' });
    }
});

app.get('/api/admin/rejected_users', async (req, res) => {
    try {
        const { rows } = await db.query("SELECT username, reject_count AS count, reject_timestamp AS timestamp FROM users WHERE status = 'rejected'");
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rejected users' });
    }
});

app.post('/api/admin/unfreeze_user', async (req, res) => {
    try {
        const { username } = req.body;
        await db.query("UPDATE users SET reject_timestamp = 0 WHERE username = $1 AND status = 'rejected'", [username]);
        res.status(200).json({ message: 'User unfrozen' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unfreeze user' });
    }
});

app.get('/api/admin/recent_data', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM orders ORDER BY id DESC LIMIT 100');
        const recent = rows.map(r => ({
            id: r.id,
            username: r.username,
            item: r.item,
            time_slot: r.time_slot,
            quantity: r.quantity,
            timestamp: r.order_timestamp
        }));
        res.status(200).json(recent);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch recent data' });
    }
});

app.post('/api/admin/remove_data', async (req, res) => {
    try {
        const { id } = req.body;
        const result = await db.query('DELETE FROM orders WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount > 0) {
            runModelBackground();
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
