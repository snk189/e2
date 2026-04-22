const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Points to the data1.csv in the parent project directory
const DATA_FILE = path.join(__dirname, '../data1.csv');

app.post('/api/order', (req, res) => {
    try {
        const orders = req.body;
        if (!Array.isArray(orders)) {
            return res.status(400).json({ error: 'Expected an array of orders.' });
        }

        // Initialize file with header if it doesn't exist
        if (!fs.existsSync(DATA_FILE)) {
            const header = "item,time_slot,quantity,timestamp,day_of_week,is_prebooking,prebooking_date,prebooking_time\n";
            fs.writeFileSync(DATA_FILE, header);
        }

        let csvData = "";
        orders.forEach(order => {
            const {
                item, time_slot, quantity, is_prebooking, day_of_week,
                prebooking_date = "", prebooking_time = "", timestamp
            } = order;

            // Format to CSV line
            csvData += `${item},${time_slot},${quantity},${timestamp},${day_of_week},${is_prebooking},${prebooking_date},${prebooking_time}\n`;
        });

        fs.appendFileSync(DATA_FILE, csvData);
        res.status(200).json({ message: 'Orders received successfully' });
    } catch (error) {
        console.error('Error saving order:', error);
        res.status(500).json({ error: 'Failed to save order' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
