# BiteSpeed — Comprehensive Feature Reference

BiteSpeed provides a deeply integrated feature set customized for three distinct user roles: Normal Users, Management Staff, and System Administrators. This document provides an exhaustive technical and functional breakdown of all capabilities within the platform.

---

## 1. Authentication, Security, and Role-Based Access Control (RBAC)

- **Three-Tier Role Hierarchy**:
  - `Normal ('n')`: Students and staff who place orders.
  - `Management ('m')`: Canteen staff responsible for kitchen fulfillment and daily operations.
  - `Admin ('a')`: System overseers managing data, approvals, and the AI engine.
- **Approval-Based Registration Workflow**: New registrations are placed in a pending state until an Admin explicitly grants system access, preventing unauthorized access.
- **Intelligent Threat Mitigation**: 
  - Employs a cooldown/freeze system for repeated failed login attempts.
  - Flagrant violations result in automated permanent blocking.
- **Session State Management**: Local persistence ensures users remain logged in across browser sessions.
- **Full Identity Lifecycle Management**: Admins have complete control to approve, reject, block, unblock, unfreeze, delete users, and force password resets.

---

## 2. Normal User — Frictionless Ordering Interface

- **Dynamic Menu Catalog**: Browse items with rich descriptions, dynamic pricing, and real-time availability.
- **Interactive Cart Tray**: A floating, slide-up cart interface optimized heavily for mobile touch screens and responsive on desktop.
- **Multi-Modal Ordering**:
  - **Dine-In**: Standard, on-the-spot ordering sent directly to the kitchen's live queue.
  - **Pre-Booking Framework**: Schedule orders for the next operational day, incentivized by an automated **5% discount**.
- **Mobile First via Capacitor**: The entire web app is compilable directly to a native Android APK, providing a seamless mobile application experience.

---

## 3. Management Dashboard — Kitchen & Operations

### Live Orders Orchestration
- **Real-Time Data Feed**: Auto-refreshing data grid showing all active orders for the current day.
- **Status Pipeline**: Orders flow linearly through: `Pending` → `Preparing` → `Ready` → `Delivered`.
- **Rapid Status Manipulation**: Action buttons directly on rows to advance or revert status.
- **Keyboard-Driven Workflow**: Fully navigable via keyboard (↑↓ to traverse rows, ←→ to transition status), optimizing kitchen efficiency.
- **Visual Color Coding**: Amber (Pending), Blue (Preparing), Green (Ready), and Grey (Delivered) for immediate visual identification across the kitchen.

### Live Demand vs. Actuals Analytics
- **Today's Performance Console**: Per-item tracking cards that contrast AI-predicted quantities against real-time actuals, featuring precise (+/-) variance indicators and active gross profit calculations.
- **Tomorrow's Forecasting Matrix**: High-contrast dark layout displaying AI-projected item volumes and locked-in pre-booked quantities. Includes a heat-mapped hourly breakdown view.
- **Financial Telemetry**: Live metric cards displaying intra-day Revenue, Cost of Goods Sold (COGS), and Net Profit.

### Supply Chain & Ingredient Tracking
- **AI-Driven Procurement**: Generates exact ingredient quantity requirements based on the AI's predicted menu demand for any given day.
- **Interactive Checklist**: Strike-through capabilities allow kitchen staff to mark items as procured in real-time, sorting them cleanly to the bottom.

---

## 4. Admin Console — Total System Control

### Demand & AI Tuning
- **Synchronized Real-Time Data**: Mirrors the Management dashboard's live actuals vs. predicted data pipeline.
- **Model Tuning Engine**:
  - **Immediate Retrain**: One-click background trigger to fit the LightGBM model on the latest data using pre-optimized parameters.
  - **Optuna Hyperparameter Search**: Initiates an aggressive 40-trial Optuna optimization cycle leveraging the server GPU.
- **Live WebSocket/Polling Telemetry**: The UI subscribes to the Python worker to stream training progress (0% → 100%) in real-time without locking the client thread.

### Advanced Business Intelligence
- **Menu Popularity Analytics**: Mines historical data arrays to identify trending dishes, declining popularity, and the absolute most profitable menu items over varying time epochs.

### Data Maintenance Suite
- **Order Inspection & Audit**: Powerful filtering by date and username to audit historical transactions.
- **Data Pruning**: Granular deletion of individual records to sanitize test/erroneous data, ensuring the ML pipeline remains uncontaminated.

---

## 5. Machine Learning Pipeline (LightGBM + Optuna)

- **Predictive Engines (Split-Model Architecture)**: State-of-the-art **LightGBM Regressors** tailored for extreme variance in retail environments. The system independently trains and manages two separate models to isolate item behavior:
  - **Model 1 (Solid Foods / Snacks)**: Predicts demand for `idly`, `dosa`, `pulao`, `sandwich`, `burger`, `pizza`, `samosa`, and `panipuri`.
  - **Model 2 (Beverages & Desserts)**: Predicts demand for `milkshake`, `tea`, `coffee`, `juice`, and `icecream`.
- **Hardware Acceleration**: Natively invokes `device_type: 'gpu'` to heavily accelerate parallel tree building.
- **Automated Hyperparameter Optimization (Optuna)**:
  - Background processes conduct extensive Time-Series Cross Validation (`TimeSeriesSplit`).
  - Explores complex topological spaces including `num_leaves`, `min_child_samples`, `colsample_bytree`, and L1/L2 regularizations.
  - Every trial is persistently logged to `ml/optuna_history.json`.
- **Advanced Feature Engineering**:
  - **Temporal Mapping**: Mathematical sine/cosine encoding of temporal boundaries (hours, days).
  - **Lag & Momentum Tracking**: Evaluates `lag_1` (previous day identical slot) and `lag_7` (previous week identical slot), rolling averages, and high-variance anomaly detection.
  - **Heuristic Indicators**: Systematically ingests macro-factors (`is_event_festival`, `exam_intensity`, `attendance_estimate`) to automatically adjust baseline predictions.
- **Asynchronous Architecture**: The ML HTTP Server (`model_server.py`) operates independently. The Node.js layer seamlessly queries this thread, streaming predictions back to the React UI.

---

## 6. Infrastructure & Developer Experience

- **Unified Launcher**: The `start.bat` script boots the Node API, Vite frontend, and Python server concurrently.
- **Hot Module Replacement (HMR)**: Vite integration ensures instantaneous UI reflection of code changes.
- **Data Synchronization**: Efficient 5-second polling cycles keep dashboards perfectly synchronized without excessive overhead.
- **Database Architecture**: PostgreSQL powers the entire application, handling user state, historical transactions, and cache management with strict ACID compliance.
