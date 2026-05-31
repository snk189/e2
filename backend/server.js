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

const LOG_FILE = path.join(__dirname, 'api_logs.txt');

// IST timestamp helper
const getISTTimestamp = () => {
    const now = new Date();
    // IST = UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const dd = String(istDate.getUTCDate()).padStart(2, '0');
    const mm = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = istDate.getUTCFullYear();
    const hh = String(istDate.getUTCHours()).padStart(2, '0');
    const min = String(istDate.getUTCMinutes()).padStart(2, '0');
    const ss = String(istDate.getUTCSeconds()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss} IST`;
};

// Rich action description builder
const buildActionDescription = (req) => {
    const url = req.url;
    const method = req.method;
    const body = req.body || {};
    const query = req.query || {};
    const params = req.params || {};

    if (url === '/api/login') return `Logged in`;
    if (url === '/api/logout') return `Logged out`;
    if (url === '/api/register') return `Requested registration (type: ${body.type || 'n'})`;
    if (url === '/api/order') {
        const items = Array.isArray(body) ? body.map(o => `${o.item}x${o.quantity}`).join(', ') : 'unknown';
        return `Placed order: [${items}]`;
    }
    if (url.startsWith('/api/history/')) return `Viewed order history`;
    if (url === '/api/admin/settings' && method === 'GET') return `Viewed canteen settings`;
    if (url === '/api/admin/settings' && method === 'POST') return `Updated canteen settings: ${JSON.stringify(body)}`;
    if (url === '/api/demand') return `Viewed Today/Tomorrow demand forecast`;
    if (url.startsWith('/api/admin/demand/')) {
        const date = url.split('/api/admin/demand/')[1];
        return `Queried demand prediction for date: ${date}`;
    }
    if (url.startsWith('/api/admin/ingredients')) {
        const date = query.date || 'today';
        return `Queried ingredient requirements for date: ${date}`;
    }
    if (url === '/api/admin/menu_intelligence') return `Viewed menu intelligence report`;
    if (url === '/api/admin/today_orders') return `Viewed today's orders`;
    if (url.startsWith('/api/admin/orders_by_date')) {
        const date = query.date || 'all';
        const uname = query.username || '';
        return `Viewed orders by date: ${date}${uname ? `, user: ${uname}` : ''}`;
    }
    if (url === '/api/admin/update_order_status') return `Updated order status for order ID: ${body.id} → ${body.status || (body.is_delivered ? 'delivered' : 'pending')}`;
    if (url === '/api/pending_users') return `Viewed pending registration requests`;
    if (url === '/api/approve_user') return `Approved registration for user: ${body.username}`;
    if (url === '/api/reject_user') return `Rejected registration for user: ${body.username}`;
    if (url === '/api/admin/users') return `Viewed all registered users`;
    if (url === '/api/admin/add_user') return `Manually added user: ${body.username} (type: ${body.type})`;
    if (url === '/api/admin/change_password') return `Changed password for user: ${body.username}`;
    if (url === '/api/admin/remove_user') return `Removed user: ${body.username}`;
    if (url === '/api/admin/block_user') return `Blocked user: ${body.username}`;
    if (url === '/api/admin/unblock_user') return `Unblocked user: ${body.username}`;
    if (url === '/api/admin/blocked_users') return `Viewed blocked users list`;
    if (url === '/api/admin/rejected_users') return `Viewed rejected users list`;
    if (url === '/api/admin/unfreeze_user') return `Unfroze cooldown for user: ${body.username}`;
    if (url === '/api/admin/recent_data') return `Viewed recent orders dataset`;
    if (url === '/api/admin/remove_data') return `Deleted data record ID: ${body.id}`;
    return `${method} ${url}`;
};

// Central log writer
const writeLog = (level, user, action, extra) => {
    const ts = getISTTimestamp();
    const line = `[${ts}] [${level}] USER: ${user} | ${action}${extra ? ` | ${extra}` : ''}\n`;
    fs.appendFile(LOG_FILE, line, (err) => {
        if (err) console.error('Failed to write to log file:', err);
    });
};

app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    let user = req.headers['x-api-user'];
    if (!user || user === 'Unknown_User') {
        user = req.body?.username || req.query?.username || req.params?.username || 'Unknown_User';
    }

    // Intercept response to capture status code and log errors
    const originalJson = res.json.bind(res);
    res.json = (data) => {
        const statusCode = res.statusCode;
        const action = buildActionDescription(req);
        if (statusCode >= 400) {
            writeLog('ERROR', user, action, `HTTP ${statusCode} — ${data?.error || JSON.stringify(data)}`);
        } else {
            writeLog('INFO', user, action);
        }
        return originalJson(data);
    };

    next();
});

app.post('/api/logout', (req, res) => {
    res.status(200).json({ message: 'Logged out successfully' });
});

// Helper for making requests to Python Model Server
const http = require('http');
const fetchPrediction = (path) => {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:5001${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 503) return reject(new Error('MODEL_TRAINING'));
                if (res.statusCode >= 400) return reject(new Error(`Server Error: ${res.statusCode} ${data}`));
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', (e) => reject(new Error(`Model Server Offline: ${e.message}`)));
    });
};

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
            
            // Retraining is handled internally by Python server's loop
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
        const result = await pool.query('SELECT * FROM orders WHERE user_id = $1 AND quantity > 0 ORDER BY order_timestamp DESC, item ASC LIMIT 50', [username]);
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

app.get('/api/demand', async (req, res) => {
    try {
        let liveDemand;
        try {
            liveDemand = await fetchPrediction('/predict_today');
        } catch (err) {
            if (err.message === 'MODEL_TRAINING') {
                return res.status(202).json({ error: 'AI Model is currently training in the background. Please try again in a few seconds.' });
            }
            throw err;
        }
        
        // Merge tomorrow's pre-booked actuals from DB (IST-aware)
        const istOffset = 19800;
        const now = Math.floor(Date.now() / 1000);
        const todayStartIST = now - ((now + istOffset) % 86400);
        const tomorrowStartIST = todayStartIST + 86400;
        const tomorrowEndIST = tomorrowStartIST + 86400;

        const r = await pool.query(
            `SELECT item, quantity, prebooking_datetime FROM orders
             WHERE quantity > 0 AND is_prebooking = '1'
               AND prebooking_datetime >= $1 AND prebooking_datetime < $2`,
            [tomorrowStartIST, tomorrowEndIST]
        );

        const tomorrowTotals = {};
        const tomorrowHourly = {};
        r.rows.forEach(row => {
            const item = row.item.toLowerCase();
            const qty = parseInt(row.quantity);
            const hour = new Date((parseInt(row.prebooking_datetime) + istOffset) * 1000).getUTCHours();
            tomorrowTotals[item] = (tomorrowTotals[item] || 0) + qty;
            if (!tomorrowHourly[item]) tomorrowHourly[item] = {};
            tomorrowHourly[item][hour] = (tomorrowHourly[item][hour] || 0) + qty;
        });

        const response = { ...liveDemand };
        if (response.tomorrow) {
            response.tomorrow = response.tomorrow.map(item => {
                const key = item.item.toLowerCase();
                const mergedHourly = (item.hourly || []).map(h => ({
                    ...h,
                    actual: tomorrowHourly[key] ? (tomorrowHourly[key][h.time] || 0) : 0
                }));
                return { ...item, actual: tomorrowTotals[key] || 0, hourly: mergedHourly };
            });
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error getting demand:', error);
        res.status(500).json({ error: 'Failed to get demand data' });
    }
});


app.get('/api/admin/demand/:date', async (req, res) => {
    try {
        const dateParam = req.params.date; // YYYY-MM-DD

        // Fetch prediction from Python server
        const [pythonData, dbResult] = await Promise.all([
            fetchPrediction(`/predict?date=${dateParam}`),
            (async () => {
                // Fetch actuals from DB for the requested date using IST-aware timestamps
                const [year, month, day] = dateParam.split('-').map(Number);
                // Build IST start/end as UTC epoch (IST = UTC+5:30 = 19800 seconds offset)
                const istOffset = 19800;
                const startIST = Date.UTC(year, month - 1, day, 0, 0, 0) / 1000 - istOffset;
                const endIST   = startIST + 86400;
                const r = await pool.query(
                    `SELECT item, quantity, order_timestamp, is_prebooking, prebooking_datetime
                     FROM orders WHERE quantity > 0
                       AND (
                         (is_prebooking != '1' AND order_timestamp >= $1 AND order_timestamp < $2)
                         OR
                         (is_prebooking = '1'  AND prebooking_datetime >= $1 AND prebooking_datetime < $2)
                       )`,
                    [startIST, endIST]
                );
                const totals = {};
                const hourly = {};
                r.rows.forEach(row => {
                    const item = row.item.toLowerCase();
                    const qty  = parseInt(row.quantity);
                    const ts   = parseInt(row.is_prebooking == 1 && row.prebooking_datetime ? row.prebooking_datetime : row.order_timestamp);
                    // Convert UTC ts → IST hour
                    const hour = new Date((ts + istOffset) * 1000).getUTCHours();
                    totals[item] = (totals[item] || 0) + qty;
                    if (!hourly[item]) hourly[item] = {};
                    hourly[item][hour] = (hourly[item][hour] || 0) + qty;
                });
                return { totals, hourly };
            })()
        ]);

        // Merge DB actuals into the Python prediction output
        if (pythonData.demand && dbResult) {
            pythonData.demand = pythonData.demand.map(item => {
                const key = item.item.toLowerCase();
                const dbActual = dbResult.totals[key] || 0;
                const mergedHourly = (item.hourly || []).map(h => ({
                    ...h,
                    actual: dbResult.hourly[key] ? (dbResult.hourly[key][h.time] || 0) : 0
                }));
                return { ...item, actual: dbActual, hourly: mergedHourly };
            });
        }

        res.status(200).json(pythonData);
    } catch (error) {
        console.error('Error getting custom demand:', error);
        res.status(500).json({ error: 'Failed to get custom demand data' });
    }
});

app.get('/api/admin/ingredients', async (req, res) => {
    try {
        const dateQuery = req.query.date;
        let demandToUse = null;
        let isCustomDate = false;

        if (dateQuery) {
            isCustomDate = true;
            try {
                const customData = await fetchPrediction(`/predict?date=${dateQuery}`);
                demandToUse = customData.demand; // Note: customDate returns { customDate, demand }
            } catch (err) {
                if (err.message === 'MODEL_TRAINING') return res.status(202).json({ error: 'Demand data not ready' });
                throw err;
            }
        } else {
            try {
                const todayData = await fetchPrediction('/predict_today');
                demandToUse = todayData.today;
            } catch (err) {
                if (err.message === 'MODEL_TRAINING') return res.status(202).json({ error: 'Demand data not ready' });
                throw err;
            }
        }
        const result = await pool.query('SELECT * FROM ingredients');
        const ingredients = result.rows;
        
        // Normalize DB item names to match Python-generated keys
        // Python uses item.title() on raw DB item names like 'icecream','panipuri'
        // So "Ice Cream" in ingredients DB must be keyed as "icecream", "Pani Puri" as "panipuri"
        const ITEM_NAME_NORMALIZE = {
            'ice cream': 'icecream',
            'pani puri': 'panipuri',
        };

        const itemToIngredients = {};
        ingredients.forEach(row => {
            let item = row.item_name.toLowerCase().trim();
            item = ITEM_NAME_NORMALIZE[item] || item; // normalize compound names
            if (!itemToIngredients[item]) itemToIngredients[item] = [];
            itemToIngredients[item].push({
                name: row.ingredient_name,
                qty: parseFloat(row.quantity_per_serving),
                unit: row.unit
            });
        });

        const ingredientTotals = {};

        // Deduplicate demandToUse by item name (case-insensitive)
        const seenItems = {};
        const dedupedDemand = [];
        for (const pred of demandToUse) {
            const key = pred.item.toLowerCase().trim();
            if (!seenItems[key]) {
                seenItems[key] = true;
                dedupedDemand.push(pred);
            }
        }

        dedupedDemand.forEach(pred => {
            const item = pred.item.toLowerCase().trim();
            // Only use actual quantities for past dates — future dates (including today) always use predicted
            const requestedDateObj = dateQuery ? new Date(dateQuery + 'T00:00:00') : null;
            const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
            const isPastDate = requestedDateObj && requestedDateObj < todayMidnight;
            const calcQty = (isPastDate && pred.actual !== undefined && pred.actual > 0) ? pred.actual : (pred.predicted || 0);
            if (itemToIngredients[item]) {
                itemToIngredients[item].forEach(ing => {
                    if (!ingredientTotals[ing.name]) {
                        ingredientTotals[ing.name] = { total: 0, unit: ing.unit, breakdown: [] };
                    }
                    const reqQty = ing.qty * calcQty;
                    ingredientTotals[ing.name].total += reqQty;
                    if (calcQty > 0) {
                        ingredientTotals[ing.name].breakdown.push({ item: pred.item, qty: reqQty, unit: ing.unit });
                    }
                });
            }
        });

        // Also add all ingredients that weren't in any demand prediction (0 demand)
        Object.keys(itemToIngredients).forEach(item => {
            itemToIngredients[item].forEach(ing => {
                if (!ingredientTotals[ing.name]) {
                    ingredientTotals[ing.name] = { total: 0, unit: ing.unit, breakdown: [] };
                }
            });
        });

        const responseData = Object.keys(ingredientTotals).map(name => ({
            name,
            total: Math.ceil(ingredientTotals[name].total), // Round up — always prepare enough
            unit: ingredientTotals[name].unit,
            breakdown: ingredientTotals[name].breakdown.map(b => ({ ...b, qty: Math.ceil(b.qty) }))
        }));

        res.status(200).json({
            date: dateQuery || 'today',
            ingredients: responseData
        });

    } catch (error) {
        console.error('Error fetching ingredients:', error);
        res.status(500).json({ error: 'Failed to fetch ingredients' });
    }
});

app.get('/api/admin/menu_intelligence', async (req, res) => {
    try {
        // Query to get quantities grouped by item and date.
        // We will do the intelligence calculation directly in Node for simplicity.
        const result = await pool.query(`
            SELECT item, quantity, order_timestamp 
            FROM orders 
            WHERE quantity > 0
        `);

        const priceMap = {'dosa': 60, 'pizza': 150, 'sandwich': 50, 'tea': 20, 'burger': 80, 'idly': 40, 'pulao': 100, 'coffee': 25, 'juice': 45, 'icecream': 50, 'samosa': 15, 'panipuri': 30};
        const costMap = {'dosa': 25, 'pizza': 70, 'sandwich': 20, 'tea': 5, 'burger': 40, 'idly': 15, 'pulao': 45, 'coffee': 10, 'juice': 20, 'icecream': 25, 'samosa': 5, 'panipuri': 12};

        const now = Date.now() / 1000;
        const oneDay = 86400;
        const sevenDaysAgo = now - (7 * oneDay);
        const thirtyDaysAgo = now - (30 * oneDay);

        const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000;
        const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime() / 1000;

        const itemStats = {};

        result.rows.forEach(row => {
            const item = row.item;
            const qty = parseInt(row.quantity) || 0;
            const ts = parseInt(row.order_timestamp) || 0;

            if (!itemStats[item]) {
                itemStats[item] = {
                    last7Days: 0,
                    last30Days: 0,
                    thisMonth: 0,
                    prevMonth: 0
                };
            }

            if (ts >= sevenDaysAgo) itemStats[item].last7Days += qty;
            if (ts >= thirtyDaysAgo) itemStats[item].last30Days += qty;
            
            if (ts >= currentMonthStart) itemStats[item].thisMonth += qty;
            if (ts >= prevMonthStart && ts < currentMonthStart) itemStats[item].prevMonth += qty;
        });

        const trending = [];
        const declining = [];
        let fastestGrowing = { item: 'N/A', growth: -Infinity };
        let mostProfitable = { item: 'N/A', profit: -Infinity };

        Object.keys(itemStats).forEach(item => {
            const stats = itemStats[item];
            const avg7 = stats.last7Days / 7;
            const avg30 = stats.last30Days / 30;

            // Trending: 7-day average is > 20% higher than 30-day average, and volume > 0
            if (avg7 > avg30 * 1.2 && stats.last7Days > 0) {
                trending.push(item);
            }
            // Declining: 7-day average is < 20% lower than 30-day average
            else if (avg7 < avg30 * 0.8 && stats.last30Days > 0) {
                declining.push(item);
            }

            // Fastest growing this month vs last month
            let growth = 0;
            if (stats.prevMonth > 0) {
                growth = ((stats.thisMonth - stats.prevMonth) / stats.prevMonth) * 100;
            } else if (stats.thisMonth > 0) {
                growth = 100; // Infinite growth, but let's cap it to 100% for baseline.
            }

            if (growth > fastestGrowing.growth && stats.thisMonth > 0) {
                fastestGrowing = { item, growth };
            }

            // Most profitable
            const profit = stats.thisMonth * ((priceMap[item] || 0) - (costMap[item] || 0));
            if (profit > mostProfitable.profit) {
                mostProfitable = { item, profit };
            }
        });

        res.status(200).json({
            trending: trending.length > 0 ? trending : ['No significant trends'],
            declining: declining.length > 0 ? declining : ['No declining items'],
            fastestGrowing: fastestGrowing.item,
            mostProfitable: mostProfitable.item
        });

    } catch (error) {
        console.error('Error calculating menu intelligence:', error);
        res.status(500).json({ error: 'Failed to calculate menu intelligence' });
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
                    id: `${row.order_timestamp}|${row.user_id}|${row.item}`,
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
                    _db_ctid: row.ctid 
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
                    id: row.order_timestamp + "|" + row.user_id + "|" + row.item,
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

app.post('/api/admin/update_order_status', async (req, res) => {
    try {
        const { id, is_delivered, status } = req.body;
        
        if (typeof id === 'string' && id.includes('|')) {
            const parts = id.split('|');
            const order_timestamp = parseInt(parts[0]);
            const user_id = parts[1];
            const item = parts.slice(2).join('|');
            
            const new_delivered = is_delivered ? 'True' : 'False';
            const new_status = status || (is_delivered ? 'delivered' : 'pending');
            
            const updateRes = await pool.query('UPDATE orders SET is_delivered = $1, status = $2 WHERE user_id = $3 AND order_timestamp = $4 AND item = $5', [new_delivered, new_status, user_id, order_timestamp, item]);
            
            if (updateRes.rowCount > 0) {
                res.status(200).json({ message: 'Order status updated successfully' });
            } else {
                res.status(404).json({ error: 'Order not found' });
            }
        } else {
            res.status(400).json({ error: 'Invalid order ID format' });
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
                id: row.order_timestamp + "|" + row.user_id + "|" + row.item,
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
        const { id } = req.body; 
        if (typeof id === 'string' && id.includes('|')) {
            const parts = id.split('|');
            const order_timestamp = parseInt(parts[0]);
            const user_id = parts[1];
            const item = parts.slice(2).join('|');
            
            const deleteRes = await pool.query('DELETE FROM orders WHERE user_id = $1 AND order_timestamp = $2 AND item = $3', [user_id, order_timestamp, item]);
            
            if (deleteRes.rowCount > 0) {
                runModelBackground(); // Trigger AI update when data is removed
                res.status(200).json({ message: 'Datapoint removed' });
            } else {
                res.status(404).json({ error: 'Datapoint not found' });
            }
        } else {
            res.status(400).json({ error: 'Invalid datapoint ID format' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove datapoint' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
