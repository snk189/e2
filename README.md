# BiteSpeed — Canteen Management & ML Demand Forecasting System

## Overview

BiteSpeed is a full-stack, AI-driven canteen management platform. It seamlessly integrates a **React + Vite** frontend, a **Node.js + Express + PostgreSQL** backend, and a **GPU-accelerated LightGBM** machine learning pipeline. BiteSpeed provides real-time demand forecasting, live order orchestration, and financial analytics for canteen operations.

The system supports three heavily-optimized roles — **Normal users** (ordering), **Management staff** (kitchen & demand tracking), and **Admin** (full system control & AI tuning) — each routed to a distinct, real-time dashboard tailored strictly to their workflow.

---

## Project Structure

```
/e2
├── backend/                  # Node.js + Express REST API
│   ├── server.js             # Main API server (port 5000), PostgreSQL integration
│   ├── management_settings.json  # Persisted environmental factor settings
│   └── package.json
│
├── frontend/                 # React + Vite web app (also compiled to Android APK)
│   ├── src/
│   │   ├── App.jsx           # Root component with role-based routing
│   │   ├── components/
│   │   │   ├── Auth.jsx              # Login & registration UI
│   │   │   ├── BookingInterface.jsx  # Normal user ordering interface
│   │   │   ├── Dashboard.jsx         # Management staff dashboard
│   │   │   ├── AdminDashboard.jsx    # Admin console (w/ AI Controls)
│   │   │   └── EnvironmentSettings.jsx  # Environmental factor controls
│   │   ├── services/
│   │   │   └── api.js        # Centralized API client
│   │   └── data/
│   │       └── items.js      # Menu item definitions
│   ├── android/              # Capacitor Android project
│   └── package.json
│
├── ml/                       # Machine Learning Python backend
│   ├── model_server.py       # Async Python HTTP Server for AI inference & tuning
│   ├── get_predictions.py    # Feature engineering, LightGBM model, and Optuna tuning
│   └── optuna_history.json   # Live audit trail of hyperparameter tuning
│
├── old/                      # Archived experimentation scripts
├── start.bat                 # One-click launcher for all 3 servers
├── features.md               # Detailed feature documentation
└── README.md                 # This file
```

---

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | v18+ | Backend server & frontend build |
| **npm** | v9+ | Package management |
| **Python** | 3.9+ | ML training & inference |
| **PostgreSQL** | 14+ | Primary database |

**Python packages**: `lightgbm`, `optuna`, `psycopg2`, `pandas`, `scikit-learn`, `numpy`

---

## Setup & Running

### Quick Start (Recommended)
```bash
# From the project root — launches Node Backend, React Frontend, and Python ML Server simultaneously!
start.bat
```

### Manual Setup

#### 1. Node Backend
```bash
cd backend
npm install
node server.js
# Server starts on http://localhost:5000
```
Database: connects to PostgreSQL `bitespeed` (default: user `postgres`, password `admin`).

#### 2. React Frontend
```bash
cd frontend
npm install
npm run dev
# App starts on http://localhost:5173
```

#### 3. Python AI Server
```bash
cd ml
python model_server.py
# Server starts on http://localhost:5001
```

---

## Machine Learning Architecture

### 🚀 LightGBM GPU Engine
The backbone of BiteSpeed is a highly optimized **LightGBM Regressor**. The model is configured to utilize CUDA/OpenCL natively (`device_type: 'gpu'`), allowing it to build deep, 150-leaf trees exponentially faster than standard CPU bounds.

### 🧠 Automated Optuna Tuning
Instead of static weights, BiteSpeed features an aggressive **Optuna hyperparameter tuning** protocol. 
Admins can hit "Retrain Model" or "Run Optuna Tuning" straight from the frontend UI. The Python server spins up a background worker to run 40 cross-validated trials across a massive search space (`num_leaves`, `colsample_bytree`, L1/L2 regularization, etc.). 
- The React UI subscribes to the background Python process to show a **live 0-100% progress bar**.
- Every iteration is cleanly dumped into `ml/optuna_history.json`.

### ⚡ Feature Engineering
BiteSpeed natively tracks and calculates highly complex indicators before feeding them to the model:
- **Lags & Trends**: Tracks absolute `lag_1` (previous day identical slot) and `lag_7` (previous week identical slot), rolling momentum, and high-variance spikes.
- **Mock Heuristics**: Calculates proximity indicators like `is_event_festival`, `exam_intensity`, and `attendance_estimate` mathematically to automatically module demand during atypical seasons.

---

## Developer Experience

- **Quick start**: `start.bat` is all you need.
- **Hot reload**: Vite-powered frontend with instant HMR during development.
- **Auto-refresh**: Dashboards poll the Node backend every 5 seconds for live data.
- **Android Ready**: Full Capacitor integration enables compiling the React web app directly into a native Android APK.

For a full deep-dive into User Roles and UI capabilities, see [features.md](./features.md).

---

*BiteSpeed — smart canteen management*
