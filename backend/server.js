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
const USERS_FILE = path.join(__dirname, '../users.csv');
const PYTHON_EXEC = "C:/Python313/python.exe";
const SCRIPT_PATH = path.join(__dirname, '../get_predictions.py');

// Initialize users file
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "username,password,type\n");
}

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
    // Debounce to prevent multiple triggers within milliseconds
    let debounceTimer;
    fs.watch(DATA_FILE, (eventType, filename) => {
        if (filename && eventType === 'change') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                runModelBackground();
            }, 500); // Wait 500ms before running
        }
    });
}

app.post('/api/order', (req, res) => {
    try {
        const orders = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ error: 'Expected an array of orders.' });
        }

        // Initialize file with header if it doesn't exist
        if (!fs.existsSync(DATA_FILE)) {
            const header = "username,item,time_slot,quantity,timestamp,day_of_week,is_prebooking,prebooking_date,prebooking_time\n";
            fs.writeFileSync(DATA_FILE, header);
        }

        let csvData = "";
        orders.forEach(order => {
            const {
                username = "guest", item, time_slot, quantity, is_prebooking, day_of_week,
                prebooking_date = "", prebooking_time = "", timestamp
            } = order;

            // Format to CSV line
            csvData += `${username},${item},${time_slot},${quantity},${timestamp},${day_of_week},${is_prebooking},${prebooking_date},${prebooking_time}\n`;
        });

        fs.appendFileSync(DATA_FILE, csvData);
        // Note: fs.watch will automatically trigger runModelBackground() here!
        
        res.status(200).json({ message: 'Orders received successfully' });
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.get('/api/history/:username', (req, res) => {
    try {
        const targetUser = req.params.username;
        if (!fs.existsSync(DATA_FILE)) {
            return res.status(200).json([]); // No data yet
        }
        
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        const lines = data.split('\n');
        
        const history = [];
        
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = line.split(',');
                // Columns: username,item,time_slot,quantity,timestamp,day_of_week,is_prebooking,prebooking_date,prebooking_time
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
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        
        const userType = type === 'm' ? 'm' : 'n'; 

        const data = fs.readFileSync(USERS_FILE, 'utf8');
        const lines = data.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [storedUser] = line.split(',');
                if (storedUser === username) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
            }
        }

        fs.appendFileSync(USERS_FILE, `${username},${password},${userType}\n`);
        res.status(200).json({ message: 'User registered successfully', type: userType });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
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
            // If cache isn't ready yet, fallback or wait
            return res.status(202).json({ error: 'AI Model is currently training in the background. Please try again in a few seconds.' });
        }
    } catch (error) {
        console.error('Error getting demand:', error);
        res.status(500).json({ error: 'Failed to get demand data' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
