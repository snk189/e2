const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const user = process.env.PGUSER || 'postgres';
const host = process.env.PGHOST || 'localhost';
const password = process.env.PGPASSWORD || 'postgres';
const port = process.env.PGPORT || 5432;
const database = process.env.PGDATABASE || 'bitespeed';

async function migrate() {
    console.log("Starting PostgreSQL migration...");
    
    // 1. Connect to default db to create the target db if it doesn't exist
    const client = new Client({ user, host, database: 'postgres', password, port });
    try {
        await client.connect();
        const res = await client.query(`SELECT datname FROM pg_catalog.pg_database WHERE datname = '${database}'`);
        if (res.rowCount === 0) {
            console.log(`Creating database ${database}...`);
            await client.query(`CREATE DATABASE ${database}`);
        } else {
            console.log(`Database ${database} already exists.`);
        }
    } catch (err) {
        console.error("Error creating database:", err);
        return;
    } finally {
        await client.end();
    }

    // 2. Connect to the target db and create tables
    const db = new Client({ user, host, database, password, port });
    try {
        await db.connect();
        
        console.log("Creating users table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                username VARCHAR(255) PRIMARY KEY,
                password VARCHAR(255) NOT NULL,
                type VARCHAR(10) NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                reject_count INT DEFAULT 0,
                reject_timestamp BIGINT DEFAULT 0
            )
        `);

        console.log("Creating orders table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) REFERENCES users(username) ON DELETE CASCADE,
                date_str VARCHAR(50),
                item VARCHAR(255),
                time_slot INT,
                quantity INT,
                order_timestamp BIGINT,
                is_holiday INT,
                is_bridge_day INT,
                season VARCHAR(50),
                temperature_celsius FLOAT,
                weather VARCHAR(50),
                is_exam_week INT,
                is_prebooking INT,
                prebooking_datetime BIGINT,
                is_delivered BOOLEAN DEFAULT false
            )
        `);

        // 3. Migrate Users Data
        console.log("Migrating users data...");
        const usersFile = path.join(__dirname, '../users/users.csv');
        if (fs.existsSync(usersFile)) {
            const lines = fs.readFileSync(usersFile, 'utf8').split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const [username, pass, type] = line.split(',');
                    await db.query(
                        `INSERT INTO users (username, password, type, status) VALUES ($1, $2, $3, 'active') ON CONFLICT (username) DO NOTHING`,
                        [username, pass, type]
                    );
                }
            }
        }

        const pendingFile = path.join(__dirname, '../users/pending_users.csv');
        if (fs.existsSync(pendingFile)) {
            const lines = fs.readFileSync(pendingFile, 'utf8').split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const [username, pass, type] = line.split(',');
                    await db.query(
                        `INSERT INTO users (username, password, type, status) VALUES ($1, $2, $3, 'pending') ON CONFLICT (username) DO UPDATE SET status = 'pending'`,
                        [username, pass, type]
                    );
                }
            }
        }

        const blockedFile = path.join(__dirname, '../users/blocked_users.csv');
        if (fs.existsSync(blockedFile)) {
            const lines = fs.readFileSync(blockedFile, 'utf8').split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    // if they are blocked, but don't exist yet, we just add dummy user to prevent orders
                    // though it violates constraints maybe? Let's just update existing or insert with dummy pass
                    await db.query(
                        `INSERT INTO users (username, password, type, status) VALUES ($1, 'dummy', 'n', 'blocked') ON CONFLICT (username) DO UPDATE SET status = 'blocked'`,
                        [line]
                    );
                }
            }
        }

        const rejectedFile = path.join(__dirname, '../users/rejected_users.csv');
        if (fs.existsSync(rejectedFile)) {
            const lines = fs.readFileSync(rejectedFile, 'utf8').split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const [username, count, ts] = line.split(',');
                    await db.query(
                        `INSERT INTO users (username, password, type, status, reject_count, reject_timestamp) VALUES ($1, 'dummy', 'n', 'rejected', $2, $3) ON CONFLICT (username) DO UPDATE SET status = 'rejected', reject_count = $2, reject_timestamp = $3`,
                        [username, parseInt(count) || 0, parseInt(ts) || 0]
                    );
                }
            }
        }

        // 4. Migrate Orders Data
        console.log("Migrating orders data...");
        const dataFile = path.join(__dirname, '../data1.csv');
        if (fs.existsSync(dataFile)) {
            const lines = fs.readFileSync(dataFile, 'utf8').split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const p = line.split(',');
                    if (p.length >= 14) {
                        // user_id,date,item,time_slot,quantity,order_timestamp,is_holiday,is_bridge_day,season,temperature_celsius,weather,is_exam_week,is_prebooking,prebooking_datetime,is_delivered
                        const username = p[0];
                        // Ensure user exists before inserting order
                        await db.query(`INSERT INTO users (username, password, type, status) VALUES ($1, 'dummy', 'n', 'active') ON CONFLICT (username) DO NOTHING`, [username]);
                        
                        await db.query(
                            `INSERT INTO orders (username, date_str, item, time_slot, quantity, order_timestamp, is_holiday, is_bridge_day, season, temperature_celsius, weather, is_exam_week, is_prebooking, prebooking_datetime, is_delivered) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
                            [
                                username, p[1], p[2], parseInt(p[3]), parseInt(p[4]), parseInt(p[5]),
                                parseInt(p[6]), parseInt(p[7]), p[8], parseFloat(p[9]), p[10],
                                parseInt(p[11]), parseInt(p[12]), p[13] ? parseInt(p[13]) : null,
                                p[14] === 'True' || p[14] === 'true'
                            ]
                        );
                    }
                }
            }
        }

        console.log("Migration completed successfully!");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await db.end();
    }
}

migrate();
