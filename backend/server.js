const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Pool } = require('pg');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'bitespeed',
  password: process.env.PGPASSWORD || 'admin',
  port: process.env.PGPORT || 5432,
  ssl: false
});

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

if (!fs.existsSync(MANAGEMENT_SETTINGS_FILE)) fs.writeFileSync(MANAGEMENT_SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));

let cachedDemand = null;
let isModelRunning = false;

const LOG_FILE = path.join(__dirname, 'api_logs.txt');
app.use((req, res, next) => {
    if (req.method === 'OPTIONS' || req.url.includes('/api/demand')) {
        return next();
    }
    const timestamp = new Date().toISOString();
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

app.post('/api/logout', (req, res) => {
    res.status(200).json({ message: 'Logged out successfully' });
});

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

runModelBackground();

// Check cooldown logic against DB
const checkCooldown = async (username) => {
    try {
        const blockRes = await pool.query('SELECT username FROM blocked_users WHERE username = $1', [username]);
        if (blockRes.rows.length > 0) {
            return { blocked: true, cooldownMsg: 'Your account has been permanently blocked.' };
        }
        const rejRes = await pool.query('SELECT reject_count, timestamp FROM rejected_users WHERE username = $1', [username]);
        if (rejRes.rows.length > 0) {
            const count = parseInt(rejRes.rows[0].reject_count, 10);
            const rejectTime = parseInt(rejRes.rows[0].timestamp, 10);
            if (rejectTime > 0) {
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
        return { blocked: false, cooldownMsg: null };
    } catch (e) {
        console.error(e);
        return { blocked: false, cooldownMsg: null };
    }
};

const incrementRejectCount = async (username) => {
    try {
        const res = await pool.query('SELECT reject_count FROM rejected_users WHERE username = $1', [username]);
        const now = Math.floor(Date.now() / 1000);
        if (res.rows.length > 0) {
            await pool.query('UPDATE rejected_users SET reject_count = reject_count + 1, timestamp = $1 WHERE username = $2', [now, username]);
        } else {
            await pool.query('INSERT INTO rejected_users (username, reject_count, timestamp) VALUES ($1, 1, $2)', [username, now]);
        }
    } catch (e) {
        console.error(e);
    }
};

const clearRejectedStatus = async (username) => {
    try {
        await pool.query('DELETE FROM rejected_users WHERE username = $1', [username]);
    } catch (e) {
        console.error(e);
    }
};

const unfreezeRejectedStatus = async (username) => {
    try {
        await pool.query('UPDATE rejected_users SET timestamp = 0 WHERE username = $1', [username]);
    } catch (e) {
        console.error(e);
    }
};

app.post('/api/order', async (req, res) => {
    try {
        const orders = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ error: 'Expected an array of orders.' });
        }

        let settings = { ...defaultSettings };
        try {
            if (fs.existsSync(MANAGEMENT_SETTINGS_FILE)) {
                settings = JSON.parse(fs.readFileSync(MANAGEMENT_SETTINGS_FILE, 'utf8'));
            }
        } catch (e) {}
        const { is_holiday, is_bridge_day, season, temperature_celsius, weather, is_exam_week } = settings;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const order of orders) {
                const {
                    username, item, time_slot, quantity, timestamp, is_prebooking, prebooking_date, prebooking_time, notes, status
                } = order;
                
                const ts = timestamp || Math.floor(Date.now() / 1000);
                const dObj = new Date(ts * 1000);
                const dateStr = [('0' + dObj.getDate()).slice(-2), ('0' + (dObj.getMonth() + 1)).slice(-2), dObj.getFullYear()].join('-');
                
                let pb_dt = null;
                const isPrebook = is_prebooking === 1 || is_prebooking === true;
                
                if (isPrebook) {
                    const pbObj = new Date(`${prebooking_date}T${prebooking_time}`);
                    pb_dt = Math.floor(pbObj.getTime() / 1000);
                    const hour = pbObj.getHours();
                    if (hour < 8 || hour >= 18) {
                        throw new Error("Canteen operates between 8 AM and 6 PM.");
                    }
                }
                
                const q = `INSERT INTO orders (user_id, date, item, time_slot, quantity, order_timestamp, is_holiday, is_bridge_day, season, temperature_celsius, weather, is_exam_week, is_prebooking, prebooking_datetime, is_delivered, status, instructions) 
                           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`;
                const v = [
                    username, dateStr, item, time_slot, quantity, ts, is_holiday, is_bridge_day, season, temperature_celsius, weather, is_exam_week, isPrebook ? 1 : 0, pb_dt, 'False', status || 'pending', (notes || '').replace(/,/g, ' ')
                ];
                await client.query(q, v);
            }
            await client.query('COMMIT');
            
            runModelBackground(); // Trigger AI update
            res.status(200).json({ message: 'Orders received successfully' });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.get('/api/history/:username', async (req, res) => {
    try {
        const username = req.params.username;
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 AND quantity > 0 ORDER BY order_timestamp DESC LIMIT 50', [username]);
        const history = result.rows.map(row => ({
            item: row.item,
            time_slot: parseInt(row.time_slot),
            quantity: parseInt(row.quantity),
            timestamp: parseInt(row.order_timestamp),
            is_prebooking: parseInt(row.is_prebooking) === 1,
            prebooking_datetime: row.prebooking_datetime ? parseInt(row.prebooking_datetime) : null,
            is_delivered: row.is_delivered === 'True',
            status: row.status ? row.status.trim() : (row.is_delivered === 'True' ? 'delivered' : 'pending'),
            notes: row.instructions ? row.instructions.trim() : ''
        }));
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
        
        await clearRejectedStatus(username);

        let userType = 'n';
        if (type === 'm') userType = 'm';
        if (type === 'a') userType = 'a';

        const uRes = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
        if (uRes.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const pRes = await pool.query('SELECT username FROM pending_users WHERE username = $1', [username]);
        if (pRes.rows.length > 0) {
            return res.status(400).json({ error: 'A request for this username is already pending approval' });
        }

        await pool.query('INSERT INTO pending_users (username, password, type) VALUES ($1, $2, $3)', [username, password, userType]);
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

        const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            return res.status(200).json({ message: 'Login successful', username, type: result.rows[0].type });
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

app.get('/api/admin/today_orders', async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
        const endOfDay = startOfDay + 86400;

        const result = await pool.query('SELECT * FROM orders WHERE quantity > 0');
        const todayOrders = [];
        
        result.rows.forEach((row, i) => {
            const is_prebooking = parseInt(row.is_prebooking) === 1;
            const effective_time = is_prebooking && row.prebooking_datetime ? parseInt(row.prebooking_datetime) : parseInt(row.order_timestamp);
            
            if (effective_time >= startOfDay && effective_time < endOfDay) {
                todayOrders.push({
                    id: row.order_timestamp + "_" + i, // Use a compound key for frontend if needed, but original used row index. We'll send CTID or row ID later if needed. For now let's just use some id.
                    username: row.user_id,
                    item: row.item,
                    quantity: parseInt(row.quantity),
                    order_timestamp: parseInt(row.order_timestamp),
                    is_prebooking: is_prebooking,
                    prebooking_datetime: row.prebooking_datetime ? parseInt(row.prebooking_datetime) : null,
                    effective_time: effective_time,
                    is_delivered: row.is_delivered === 'True',
                    status: row.status ? row.status.trim() : (row.is_delivered === 'True' ? 'delivered' : 'pending'),
                    notes: row.instructions ? row.instructions.trim() : '',
                    _db_ctid: row.ctid // we can't get ctid easily in standard select *, let's assume we use order_timestamp+user_id as id.
                });
            }
        });

        todayOrders.sort((a, b) => a.effective_time - b.effective_time);
        res.status(200).json(todayOrders);
    } catch (error) {
        console.error('Error fetching today orders:', error);
        res.status(500).json({ error: 'Failed to fetch today orders' });
    }
});

app.get('/api/admin/orders_by_date', async (req, res) => {
    try {
        const queryDateStr = req.query.date;
        const queryUsername = req.query.username;
        
        if (!queryDateStr && !queryUsername) return res.status(400).json({ error: 'Date or username is required' });
        
        let startOfDay, endOfDay;
        if (queryDateStr) {
            const [year, month, day] = queryDateStr.split('-');
            startOfDay = new Date(year, month - 1, day).getTime() / 1000;
            endOfDay = startOfDay + 86400;
        }

        const result = await pool.query('SELECT * FROM orders WHERE quantity > 0');
        const dateOrders = [];

        result.rows.forEach((row, i) => {
            const is_prebooking = parseInt(row.is_prebooking) === 1;
            const effective_time = is_prebooking && row.prebooking_datetime ? parseInt(row.prebooking_datetime) : parseInt(row.order_timestamp);
            
            const matchesUsername = queryUsername ? (row.user_id === queryUsername) : true;
            const matchesDate = queryDateStr ? (effective_time >= startOfDay && effective_time < endOfDay) : true;
            
            if (matchesUsername && matchesDate) {
                dateOrders.push({
                    id: row.order_timestamp + "_" + i,
                    username: row.user_id,
                    item: row.item,
                    quantity: parseInt(row.quantity),
                    order_timestamp: parseInt(row.order_timestamp),
                    is_prebooking: is_prebooking,
                    prebooking_datetime: row.prebooking_datetime ? parseInt(row.prebooking_datetime) : null,
                    effective_time: effective_time,
                    is_delivered: row.is_delivered === 'True',
                    status: row.status ? row.status.trim() : (row.is_delivered === 'True' ? 'delivered' : 'pending'),
                    notes: row.instructions ? row.instructions.trim() : '',
                    dateStr: row.date 
                });
            }
        });

        dateOrders.sort((a, b) => a.effective_time - b.effective_time);
        res.status(200).json(dateOrders);
    } catch (error) {
        console.error('Error fetching orders by date:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Since the original code updated status by line index `id`, we must adapt the frontend or update by a better identifier.
// The original UI sent `id` as line index. Without line indices, we need a workaround.
// The frontend might be sending line index, which we can't reliably map unless we fetch all and update that offset.
app.post('/api/admin/update_order_status', async (req, res) => {
    try {
        const { id, is_delivered, status } = req.body;
        // In CSV, `id` was line number. Let's fetch all orders and find the one at offset `id - 1` if it's an integer.
        // For safe compatibility with existing frontend, we use offset.
        const allRes = await pool.query('SELECT user_id, order_timestamp FROM orders');
        if (id >= 1 && id <= allRes.rows.length) {
            const rowToUpdate = allRes.rows[id - 1]; // because line 0 is header in csv, so id=1 is row 0.
            const new_delivered = is_delivered ? 'True' : 'False';
            const new_status = status || (is_delivered ? 'delivered' : 'pending');
            
            await pool.query('UPDATE orders SET is_delivered = $1, status = $2 WHERE user_id = $3 AND order_timestamp = $4', [new_delivered, new_status, rowToUpdate.user_id, rowToUpdate.order_timestamp]);
            res.status(200).json({ message: 'Order status updated successfully' });
        } else {
            res.status(404).json({ error: 'Order not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

app.get('/api/pending_users', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, type FROM pending_users');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching pending users:', error);
        res.status(500).json({ error: 'Failed to fetch pending users' });
    }
});

app.post('/api/approve_user', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const result = await pool.query('SELECT * FROM pending_users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pending user not found' });
        }
        
        const userToApprove = result.rows[0];
        await pool.query('INSERT INTO users (username, password, type) VALUES ($1, $2, $3)', [userToApprove.username, userToApprove.password, userToApprove.type]);
        await pool.query('DELETE FROM pending_users WHERE username = $1', [username]);
        await clearRejectedStatus(username);
        
        res.status(200).json({ message: 'User approved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

app.post('/api/reject_user', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username is required' });

        const result = await pool.query('SELECT * FROM pending_users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pending user not found' });
        }
        
        await pool.query('DELETE FROM pending_users WHERE username = $1', [username]);
        await incrementRejectCount(username);

        res.status(200).json({ message: 'User rejected successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, type FROM users');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/admin/add_user', async (req, res) => {
    try {
        const { username, password, type } = req.body;
        if (!username || !password || !type) return res.status(400).json({ error: 'Missing fields' });

        const uRes = await pool.query('SELECT username FROM users WHERE username = $1', [username]);
        if (uRes.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        await pool.query('INSERT INTO users (username, password, type) VALUES ($1, $2, $3)', [username, password, type]);
        await clearRejectedStatus(username);
        res.status(200).json({ message: 'User added successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add user' });
    }
});

app.post('/api/admin/change_password', async (req, res) => {
    try {
        const { username, newPassword } = req.body;
        if (!username || !newPassword) return res.status(400).json({ error: 'Username and new password are required' });

        const result = await pool.query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, username]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

app.post('/api/admin/remove_user', async (req, res) => {
    try {
        const { username } = req.body;
        await pool.query('DELETE FROM users WHERE username = $1', [username]);
        res.status(200).json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

app.post('/api/admin/block_user', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Username required' });
        
        const bRes = await pool.query('SELECT username FROM blocked_users WHERE username = $1', [username]);
        if (bRes.rows.length === 0) {
            await pool.query('INSERT INTO blocked_users (username) VALUES ($1)', [username]);
        }

        await pool.query('DELETE FROM users WHERE username = $1', [username]);
        await pool.query('DELETE FROM pending_users WHERE username = $1', [username]);

        res.status(200).json({ message: 'User blocked completely' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to block user' });
    }
});

app.post('/api/admin/unblock_user', async (req, res) => {
    try {
        const { username } = req.body;
        await pool.query('DELETE FROM blocked_users WHERE username = $1', [username]);
        res.status(200).json({ message: 'User unblocked' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

app.get('/api/admin/blocked_users', async (req, res) => {
    try {
        const result = await pool.query('SELECT username FROM blocked_users');
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch blocked users' });
    }
});

app.get('/api/admin/rejected_users', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, reject_count as count, timestamp FROM rejected_users');
        res.status(200).json(result.rows.map(row => ({
            username: row.username,
            count: parseInt(row.count, 10),
            timestamp: parseInt(row.timestamp, 10)
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rejected users' });
    }
});

app.post('/api/admin/unfreeze_user', async (req, res) => {
    try {
        const { username } = req.body;
        await unfreezeRejectedStatus(username);
        res.status(200).json({ message: 'User unfrozen' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unfreeze user' });
    }
});

app.get('/api/admin/recent_data', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM orders');
        const recent = [];
        // fetch last 100 entries
        const rows = result.rows;
        for (let i = rows.length - 1; i >= 0 && recent.length < 100; i--) {
            const row = rows[i];
            recent.push({
                id: i + 1, // To maintain 1-based index equivalent to line numbers
                username: row.user_id,
                item: row.item,
                time_slot: row.time_slot,
                quantity: row.quantity,
                timestamp: row.order_timestamp
            });
        }
        res.status(200).json(recent);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch recent data' });
    }
});

app.post('/api/admin/remove_data', async (req, res) => {
    try {
        const { id } = req.body; // id is the line index (1-based)
        const allRes = await pool.query('SELECT user_id, order_timestamp FROM orders');
        if (id >= 1 && id <= allRes.rows.length) {
            const rowToUpdate = allRes.rows[id - 1];
            await pool.query('DELETE FROM orders WHERE user_id = $1 AND order_timestamp = $2', [rowToUpdate.user_id, rowToUpdate.order_timestamp]);
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
