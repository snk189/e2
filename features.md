# BiteSpeed — Feature Reference

BiteSpeed is a full-stack canteen management and AI-driven demand forecasting system. It serves three user roles — Normal users, Management staff, and Admins — each with a purpose-built interface and real-time backend synchronization.

---

## 1. Authentication & Role-Based Access

- **Three-tier roles**: Normal (`n`), Management (`m`), Admin (`a`) — each routed to a distinct dashboard on login.
- **Registration with approval flow**: New users register and wait for admin approval before accessing the system.
- **Cooldown / freeze system**: Failed login attempts trigger a cooldown; repeated violations escalate to a permanent block.
- **Session persistence**: Login state is persisted locally; auto-redirect on return visits.
- **Admin user lifecycle**: Approve, reject, block, unblock, unfreeze, remove, and change passwords from the admin console.

---

## 2. Normal User — Food Ordering Interface

- **Menu browsing**: Full menu with item cards, descriptions, and pricing.
- **Floating cart tray**: Interactive slide-up cart popup, optimized for both desktop and mobile.
- **Order types**:
  - **Dine-in**: Instant order placement for immediate kitchen processing.
  - **Pre-book**: Schedule orders for the next day at a **5% discount**.
- **Cross-platform**: Web app wrapped with **Capacitor** for native Android APK compilation.

---

## 3. Management Dashboard

### Orders Tab
- **Live order table**: Real-time auto-refreshing view of all today's orders.
- **Status pipeline**: Each order flows through Pending → Preparing → Ready → Delivered.
- **Status controls**: Advance or revert status via on-row buttons.
- **Keyboard navigation**: Full keyboard control — ↑↓ to select rows, ←→ to change status.
- **Visual coding**: Color-coded rows per status (amber = pending, blue = preparing, green = ready, grey = delivered).

### Demand Tab
- **Today's Performance**: Live per-item cards contrasting AI predicted quantity vs absolute real-time actuals. Features a precise variance indicator (+/-) and active profit calculations.
- **Tomorrow's Forecast**: Dark-contrast card layout with AI-projected quantities and pre-booked count; hourly breakdown on expand; heat-colored hour tiles.
- **Financial metrics**: Live Revenue, Cost, and Net Profit cards calculated from actual orders placed today.

### Ingredients Tab
- **AI-driven ingredient forecast**: Calculates required ingredient quantities based on predicted menu demand for today or any selected date.
- **Checklist mode**: Tap checkbox to mark an ingredient as procured; checked items sort to bottom with strikethrough.

---

## 4. Admin Console

### Demand Tab
- **Real-Time Data Feed**: Features the exact same live actual vs predicted pipeline as the Management dashboard, ensuring complete data consistency across the hierarchy.
- **Model Tuning Engine**: 
  - **Retrain**: Trigger an immediate background LightGBM fit using existing best parameters.
  - **Optuna Search**: Triggers an aggressive background 40-trial Optuna hyperparameter search across the GPU.
- **Live Progress Tracking**: Web UI subscribes to the Python backend to stream real-time training progress (0% -> 100%) without freezing the page.

### Intelligence Tab
- **Menu popularity intelligence**: Analyzes historical order data to surface top trending, declining, and most profitable items.

### Data Maintenance Tab
- **Order inspection**: View all orders filtered by date and/or username.
- **Order deletion**: Remove individual records to clean up test or erroneous data.

---

## 5. Machine Learning Pipeline (LightGBM + Optuna)

- **Algorithm**: State-of-the-art **LightGBM Regressor** customized for extreme accuracy on high-variance retail data.
- **Hardware Acceleration**: Configured strictly with `device_type: 'gpu'` to heavily accelerate parallel tree building during Optuna searches.
- **Automated Optuna Hyperparameter Tuning**:
  - Background worker conducts 40 trials of Time-Series Cross Validation (TimeSeriesSplit).
  - Actively explores a massive search space including `num_leaves`, `min_child_samples`, `colsample_bytree`, `subsample_freq`, and powerful L1/L2 regularizations (`reg_alpha`, `reg_lambda`).
  - Dumps a live audit trail of every trial into `optuna_history.json`.
- **Advanced Feature Engineering**:
  - **Temporal**: Sine/cosine encoding of hours, days, and months.
  - **Lags & Trends**: Tracks absolute `lag_1` (previous day identical slot) and `lag_7` (previous week identical slot), rolling momentum, and high-variance spikes.
  - **Mock Heuristics**: Automatically tracks proxy indicators like `is_event_festival`, `exam_intensity`, and `attendance_estimate` to modulate demand natively.
- **Async Python Server Architecture**: The ML server executes all heavy LightGBM tasks on secondary threads. Real-time Node.js backend seamlessly polls the Python thread for AI demand and streams it to the React UI.

---

## 6. Infrastructure & Developer Experience

- **Quick start**: `start.bat` launches backend, frontend, and Python Server simultaneously from the root.
- **Hot reload**: Vite-powered frontend with instant HMR during development.
- **Auto-refresh**: Dashboards poll the Node backend every 5 seconds for live data.
- **PostgreSQL**: Robust relational database tracking all historical orders,user profiles, and caching state.
