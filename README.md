# BiteSpeed — Canteen Management & ML Demand Forecasting System

## Overview

BiteSpeed is a full-stack canteen management platform combining a **React + Vite** frontend, a **Node.js + Express** backend, and an **XGBoost + CatBoost ML pipeline** to provide real-time demand forecasting, order management, and financial analytics for canteen operations.

The system supports three roles — **Normal users** (ordering), **Management staff** (kitchen & demand view), and **Admin** (full system control) — each with a distinct dashboard tailored to their workflow.

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
│   │   │   ├── AdminDashboard.jsx    # Admin console
│   │   │   └── EnvironmentSettings.jsx  # Environmental factor controls
│   │   ├── services/
│   │   │   └── api.js        # Centralized API client
│   │   └── data/
│   │       └── items.js      # Menu item definitions
│   ├── android/              # Capacitor Android project
│   ├── public/               # Static assets
│   └── package.json
│
├── ml/                       # Machine Learning pipeline
│   ├── xgb.py                # XGBoost model training script
│   ├── get_predictions.py    # Inference script (outputs JSON predictions)
│   ├── update_dataset.py     # Dataset maintenance utility
│   └── xgboost_model.json    # Trained model weights
│
├── start.bat                 # One-click launcher for backend + frontend
├── features.md               # Feature documentation
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
| **Android Studio** | latest | Optional — Android APK build |

**Python packages**: `xgboost`, `psycopg2`, `pandas`, `scikit-learn`, `numpy`

---

## Setup & Running

### Quick Start (Recommended)
```bash
# From the project root — launches backend AND frontend simultaneously
start.bat
```

### Manual Setup

#### 1. Backend
```bash
cd backend
npm install
node server.js
# Server starts on http://localhost:5000
```
Database: connects to PostgreSQL `bitespeed` (default: user `postgres`, password `admin`).

#### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# App starts on http://localhost:5173
```

---

## User Roles & Dashboards

### 🧑 Normal User — `BookingInterface`
- Browse the menu and add items to a floating interactive cart
- Place **Dine-in** orders (instant) or **Pre-book** orders (scheduled for next day with 5% discount)
- View personal order history and live status updates

### 👨‍🍳 Management Staff — `Dashboard`
- **Orders tab**: Live table of today's orders with status pipeline (Pending → Preparing → Ready → Delivered). Full keyboard navigation (↑↓ select, ←→ advance status).
- **Demand tab**:
  - *Normal subtab*: Today's performance (predicted vs actual per item + profit chips), Tomorrow's forecast in dark-contrast card layout, Revenue/Cost/Profit metrics
  - *Advanced subtab*: Date-picker driven ML forecast for any future date (predicted only, no actuals)
- **Ingredients tab**: AI-driven ingredient requirements for today or any selected date, with per-item checklist and expandable breakdown by recipe
- **Settings tab**: Environmental factor management

### 🛡️ Admin — `AdminDashboard`
- **Demand tab**: Full demand analytics with XGBoost model performance chart, today's actuals, tomorrow's forecast, advanced date-based prediction
- **Intelligence tab**: Menu popularity intelligence — **top 3 trending**, declining items, fastest growing, most profitable
- **Data tab**: Order maintenance — inspect, filter, and delete individual order records by date/user
- **Users tab**: Full user lifecycle management — approve/reject pending registrations, add users manually, block/unblock/unfreeze accounts, change passwords inline
- **Settings tab**: Environmental settings (same as management)

---

## Machine Learning Pipeline

### Training
```bash
python ml/xgb.py
```
- Pulls order history directly from PostgreSQL
- Feature engineering: temporal (hour, day-of-week, cyclical encoding), lag/rolling statistics (momentum, historical averages), environmental factors
- Trains an **XGBoost** and **CatBoost** ensemble regressor per menu item
- Saves trained weights to `ml/xgboost_model.json` and `ml/catboost_model.cbm`

### Inference
The backend automatically triggers `get_predictions.py` in the background whenever the database changes, caching forecasts for instant delivery to the frontend.

Manual run:
```bash
python ml/get_predictions.py
```
Outputs per-item hourly predicted demand and financial projections (revenue, cost, net profit).

### Auto-Retraining
The Node.js backend watches for database changes and re-executes the ML model automatically, keeping predictions fresh without manual intervention.

---

## Android Build (Optional)

> **⚠️ Windows Firewall** — Your phone must reach the laptop on port `5000`. Add an inbound rule for TCP port 5000 in Windows Defender Firewall.

1. Set your laptop's local IP in `frontend/src/services/api.js`
2. Build and sync:
```bash
cd frontend
npm run build
npx cap sync android
```
3. Open `frontend/android` in Android Studio → **Build → Build APK(s)**
4. Install the `.apk` on your device

---

## Environmental Settings

Admins and management staff can tune environmental factors (e.g., weather, events, holidays) via the Settings tab. These factors are persisted in `backend/management_settings.json` and fed into the ML model at inference time, improving prediction accuracy during unusual days.

---

*BiteSpeed — smart canteen management, powered by real data.*
