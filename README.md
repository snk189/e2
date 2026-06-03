# BiteSpeed — Canteen Management & AI-Driven Demand Forecasting System

## Overview
BiteSpeed is a cutting-edge, full-stack canteen management platform designed to revolutionize institutional food service. By seamlessly combining a modern web frontend, a robust transactional backend, and an advanced Machine Learning pipeline, BiteSpeed provides real-time demand forecasting, live order orchestration, comprehensive financial analytics, and an integrated supply chain checklist.

The system is architected around three highly optimized roles:
- **Normal Users**: A frictionless ordering interface supporting immediate dine-in or discounted pre-booking.
- **Management Staff**: A tactical dashboard for kitchen operations, real-time demand vs. actuals tracking, and ingredient procurement.
- **Administrators**: A master control console for system-wide configuration, AI hyperparameter tuning, and advanced business intelligence.

## System Architecture

BiteSpeed operates on a distributed, microservices-inspired architecture comprising three core engines:

### 1. Frontend Web & Mobile Client (React + Vite + Tailwind CSS + Capacitor)
- **Framework**: React.js bundled via Vite for lightning-fast HMR and optimized production builds.
- **Styling**: Tailwind CSS for a responsive, utility-first UI design.
- **Cross-Platform**: Integrated with Capacitor to seamlessly wrap the React web app into a native Android APK.
- **Real-Time Polling**: Smart polling mechanisms fetch live data every 5 seconds without overloading the backend.

### 2. Backend API & Database (Node.js + Express + PostgreSQL)
- **API Gateway**: A Node.js and Express.js RESTful API serving as the central hub for authentication, order processing, and state management.
- **Database**: PostgreSQL (v14+) provides robust ACID compliance for critical transactional data, user roles, and order history.
- **State Management**: Persists environmental settings (`management_settings.json`) used as heuristics for the ML pipeline.

### 3. Machine Learning Inference & Training Server (Python + LightGBM + Optuna)
- **Async Python HTTP Server**: Hosts the ML models (`model_server.py`) independent of the transactional backend, ensuring heavy computations don't block the Node.js API.
- **GPU-Accelerated LightGBM**: Utilizes `device_type: 'gpu'` to build deep trees across a massive dataset with minimal latency.
- **Live Hyperparameter Tuning**: Features an integrated Optuna worker that runs cross-validated trials natively triggered from the Admin UI.

## Directory Structure
```text
/e2
├── backend/                  # Node.js + Express API & PostgreSQL Integration
│   ├── server.js             # Main server logic and routing
│   ├── management_settings.json # Mock heuristic data configuration
│   └── package.json          # Node dependencies
├── frontend/                 # React + Vite web app
│   ├── android/              # Capacitor Android build configuration
│   ├── src/                  # React components, services, and assets
│   ├── tailwind.config.js    # Tailwind UI configuration
│   └── package.json          # Frontend dependencies
├── ml/                       # Python Machine Learning Backend
│   ├── model_server.py       # Asynchronous inference & tuning server
│   ├── get_predictions.py    # Feature engineering & LightGBM logic
│   ├── lightgbm_model.joblib # Serialized model artifact
│   └── optuna_history.json   # Live trail of hyperparameters
├── old/                      # Archived experimentation scripts
├── start.bat                 # One-click unified launcher for all services
├── features.md               # Deep dive into system features
└── README.md                 # Project architecture & setup documentation
```

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | v18+ | Backend API and frontend Vite server |
| **npm** | v9+ | JavaScript package management |
| **Python** | 3.9+ | ML training, inference, and data processing |
| **PostgreSQL** | 14+ | Primary relational database (`bitespeed` DB) |

**Python Dependencies**: `lightgbm`, `optuna`, `psycopg2`, `pandas`, `scikit-learn`, `numpy`, `joblib`.

## Setup & Running

### Quick Start (Recommended)
Launch the entire stack (Node Backend, React Frontend, Python ML Server) synchronously via the master script:
```bash
start.bat
```

### Manual Setup
**1. Node.js Backend:**
```bash
cd backend
npm install
node server.js
```
*Note: Ensure PostgreSQL is running with a database named `bitespeed`.*

**2. React Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**3. Python AI Server:**
```bash
cd ml
pip install -r requirements.txt # (Ensure dependencies are met)
python model_server.py
```

## Machine Learning Capabilities

### 🚀 Dual LightGBM GPU Engines
BiteSpeed utilizes a **split-model architecture**, running two independent, highly optimized LightGBM Regressors tailored to the specific variance patterns of different item categories. Both leverage GPU acceleration to exponentially speed up deep tree building (up to 150 leaves).
- **Model 1 (Solid Foods / Snacks)**: Specifically trained to forecast demand for heavy items and snacks (`idly`, `dosa`, `pulao`, `sandwich`, `burger`, `pizza`, `samosa`, `panipuri`).
- **Model 2 (Beverages & Desserts)**: Specifically trained to forecast demand for drinks and sweets (`milkshake`, `tea`, `coffee`, `juice`, `icecream`).

### 🧠 Automated Optuna Tuning
Instead of static weights, BiteSpeed employs an aggressive Optuna hyperparameter optimization protocol. Administrators can trigger "Retrain Model" or "Run Optuna Tuning" from the frontend UI. A background Python worker executes Time-Series Cross Validation trials, optimizing parameters like `num_leaves`, `colsample_bytree`, and regularization techniques. Progress is streamed directly to the UI.

### ⚡ Advanced Feature Engineering
The model is fed deeply engineered features to accurately anticipate demand:
- **Temporal & Cyclic**: Sine/cosine encoding of hours, days, and months.
- **Lags & Trends**: Tracks absolute identical previous slot data (`lag_1`, `lag_7`), momentum averages, and rolling variance.
- **Mock Heuristics**: Dynamically ingests `is_event_festival`, `exam_intensity`, and `attendance_estimate` to modulate baseline predictions during atypical periods.

For an exhaustive breakdown of user roles, dashboards, and features, refer to [features.md](./features.md).
