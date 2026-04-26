const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Points to the data1.csv in the parent project directory
const DATA_FILE = path.join(__dirname, '../data1.csv');
const USER_ORDERS_FILE = path.join(__dirname, '../user_orders.csv');
const USERS_FILE = path.join(__dirname, '../users.csv');
const PENDING_USERS_FILE = path.join(__dirname, '../pending_users.csv');
const BLOCKED_USERS_FILE = path.join(__dirname, '../blocked_users.csv');
const REJECTED_USERS_FILE = path.join(__dirname, '../rejected_users.csv');

const PYTHON_EXEC = "C:/Python313/python.exe";
const SCRIPT_PATH = path.join(__dirname, '../get_predictions.py');

// Initialize files
if (!fs.existsSync(USER_ORDERS_FILE)) fs.writeFileSync(USER_ORDERS_FILE, "username,item,time_slot,quantity,timestamp,day_of_week,is_prebooking,prebooking_date,prebooking_time\n");
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "username,password,type\n");
if (!fs.existsSync(PENDING_USERS_FILE)) fs.writeFileSync(PENDING_USERS_FILE, "username,password,type\n");
if (!fs.existsSync(BLOCKED_USERS_FILE)) fs.writeFileSync(BLOCKED_USERS_FILE, "username\n");
if (!fs.existsSync(REJECTED_USERS_FILE)) fs.writeFileSync(REJECTED_USERS_FILE, "username,reject_count,timestamp\n");

// Background Model Evaluation Cache
let cachedDemand = null;
let isModelRunning = false;

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

// ----------------------------------------------------
// REGULAR ENDPOINTS
// ----------------------------------------------------

app.post('/api/order', (req, res) => {
    try {
        const orders = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ error: 'Expected an array of orders.' });
        }

        if (!fs.existsSync(USER_ORDERS_FILE)) {
            fs.writeFileSync(USER_ORDERS_FILE, "username,item,time_slot,quantity,timestamp,day_of_week,is_prebooking,prebooking_date,prebooking_time\n");
        }
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, "date,item,time_slot,quantity,timestamp,is_holiday,is_bridge_day,season,temperature_celsius,weather,is_exam_week\n");
        }

        let userOrdersData = "";
        let mlDatasetData = "";
        
        orders.forEach(order => {
            const {
                username = "guest", item, time_slot, quantity, is_prebooking, day_of_week,
                prebooking_date = "", prebooking_time = "", timestamp
            } = order;
            
            userOrdersData += `${username},${item},${time_slot},${quantity},${timestamp},${day_of_week},${is_prebooking},${prebooking_date},${prebooking_time}\n`;
            
            const dObj = new Date(timestamp * 1000);
            const dateStr = [('0' + dObj.getDate()).slice(-2), ('0' + (dObj.getMonth() + 1)).slice(-2), dObj.getFullYear()].join('-');
            const is_holiday = 0, is_bridge_day = 0, season = 'winter', temp_celsius = 25.0, weather = 'sunny', is_exam_week = 0;
            
            mlDatasetData += `${dateStr},${item},${time_slot},${quantity},${timestamp},${is_holiday},${is_bridge_day},${season},${temp_celsius},${weather},${is_exam_week}\n`;
        });

        fs.appendFileSync(USER_ORDERS_FILE, userOrdersData);
        fs.appendFileSync(DATA_FILE, mlDatasetData);
        
        res.status(200).json({ message: 'Orders received successfully' });
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.get('/api/history/:username', (req, res) => {
    try {
        const targetUser = req.params.username;
        if (!fs.existsSync(USER_ORDERS_FILE)) return res.status(200).json([]);
        
        const data = fs.readFileSync(USER_ORDERS_FILE, 'utf8');
        const lines = data.split('\n');
        const history = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                const uname = parts[0];
                if (uname === targetUser && parts.length >= 5) {
                    history.push({
                        item: parts[1],
                        time_slot: parseInt(parts[2]),
                        quantity: parseInt(parts[3]),
                        timestamp: parseInt(parts[4]),
                        is_prebooking: parseInt(parts[6]) === 1,
                        prebooking_date: parts[7] || null,
                        prebooking_time: parts[8] || null
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
        clearRejectedStatus(username);
        res.status(200).json({ message: 'User unfrozen' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unfreeze user' });
    }
});

app.get('/api/admin/recent_data', (req, res) => {
    try {
        if (!fs.existsSync(USER_ORDERS_FILE)) return res.status(200).json([]);
        const data = fs.readFileSync(USER_ORDERS_FILE, 'utf8');
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
                    item: parts[1],
                    time_slot: parts[2],
                    quantity: parts[3],
                    timestamp: parts[4]
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
        const lines = fs.readFileSync(USER_ORDERS_FILE, 'utf8').split('\n');
        if (id >= 1 && id < lines.length) {
            const removedLine = lines[id];
            lines.splice(id, 1);
            fs.writeFileSync(USER_ORDERS_FILE, lines.join('\n'));
            
            if (removedLine && fs.existsSync(DATA_FILE)) {
                const ts = removedLine.split(',')[4]; // timestamp is 5th col
                const mlLines = fs.readFileSync(DATA_FILE, 'utf8').split('\n');
                const newMlLines = mlLines.filter((mlLine, idx) => {
                    if (idx === 0) return true;
                    if (!mlLine.trim()) return false;
                    return mlLine.split(',')[4] !== ts;
                });
                fs.writeFileSync(DATA_FILE, newMlLines.join('\n') + '\n');
            }
            
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
