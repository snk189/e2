# BiteSpeed — Feature Reference

BiteSpeed is a full-stack canteen management and ML demand forecasting system. It serves three user roles — Normal users, Management staff, and Admins — each with a purpose-built interface.

---

## 1. Authentication & Role-Based Access

- **Three-tier roles**: Normal (`n`), Management (`m`), Admin (`a`) — each routed to a distinct dashboard on login
- **Registration with approval flow**: New users register and wait for admin approval before accessing the system
- **Cooldown / freeze system**: Failed login attempts trigger a cooldown; repeated violations escalate to permanent block
- **Session persistence**: Login state persisted locally; auto-redirect on return visits
- **Admin user lifecycle**: Approve, reject, block, unblock, unfreeze, remove, and change passwords — all from the admin console

---

## 2. Normal User — Food Ordering Interface

- **Menu browsing**: Full menu with item cards, descriptions, and pricing
- **Floating cart tray**: Interactive slide-up cart popup, optimized for both desktop and mobile
- **Order types**:
  - **Dine-in**: Instant order placement for immediate kitchen processing
  - **Pre-book**: Schedule orders for the next day at a **5% discount**
- **Notes**: Attach special instructions to any order
- **Cross-platform**: Web app wrapped with **Capacitor** for native Android APK compilation

---

## 3. Management Dashboard

### Orders Tab
- **Live order table**: Real-time auto-refreshing view of all today's orders (5-second polling)
- **Status pipeline**: Each order flows through Pending → Preparing → Ready → Delivered
- **Status controls**: Advance or revert status via on-row buttons
- **Keyboard navigation**: Full keyboard control — ↑↓ to select rows, ←→ to change status, no mouse needed
- **Visual coding**: Color-coded rows per status (amber = pending, blue = preparing, green = ready, grey = delivered)
- **Order metadata**: Shows time, username, item, quantity, notes, and dine-in vs pre-book type

### Demand Tab — Normal Subtab
- **Today's Performance**: Per-item cards showing predicted quantity; actual count surfaced as a small chip; variance indicator (demand ▲ / short ▼ / spot on ✅); profit chip
- **Tomorrow's Forecast**: Dark-contrast card layout with AI-projected quantities and pre-booked count; hourly breakdown on expand; heat-colored hour tiles
- **Financial metrics**: Live Revenue, Cost, and Net Profit cards calculated from actual orders placed today

### Demand Tab — Advanced Subtab
- **Date-picker forecasting**: Select any future date and run the ML model for a full demand prediction
- **Prediction-only view**: No actual numbers shown — purely forward-looking forecast with hourly breakdown

### Ingredients Tab
- **AI-driven ingredient forecast**: Calculates required ingredient quantities based on predicted menu demand for today or any selected date
- **Per-ingredient cards**: Shows total quantity needed with unit; expandable breakdown by recipe contribution with mini progress bars
- **Checklist mode**: Tap checkbox to mark an ingredient as procured; checked items sort to bottom with strikethrough
- **Keyboard navigation**: ↑↓ to navigate, Enter to toggle check

### Settings Tab
- **Environmental factors**: Tune contextual inputs (e.g., weather, special events) that influence the ML model's demand predictions

---

## 4. Admin Console

### Demand Tab
- **Financial overview**: Total Revenue, Cost, and Net Profit metrics
- **Model performance chart**: Interactive Recharts line chart — total predicted vs actual demand by hour; toggle per-item breakdown by clicking item chips
- **Today's Performance list**: Predicted vs actual per item with profit and variance; hourly breakdown on expand
- **Tomorrow's Forecast list**: AI-projected quantities per item
- **Advanced date forecast**: Date-picker driven ML prediction for any date (prediction-only)

### Intelligence Tab
- **Menu popularity intelligence**: Analyzes historical order data to surface:
  - **Top 3 trending items** (fastest rising in recent periods)
  - **Declining items** (falling demand)
  - **Fastest growing item** (highest growth rate)
  - **Most profitable item** (best margin contribution)

### Data Maintenance Tab
- **Order inspection**: View all orders filtered by date and/or username
- **Quick date presets**: Yesterday / Today / Tomorrow buttons
- **Financial summaries**: Item count, revenue, cost, and profit for the filtered set
- **Order deletion**: Remove individual records to clean up test or erroneous data

### Users Tab
- **Pending approvals**: Review and approve or reject new registrations; block directly from pending queue
- **All users**: Add users manually (username, password, role); remove or block existing users; inline password change mode
- **Blocked & Frozen**: View permanently blocked users (unblock) and cooldown-frozen users (unfreeze without losing strike count)

### Settings Tab
- Same environmental settings panel as management — shared persistence

---

## 5. Machine Learning Pipeline

- **Algorithm**: XGBoost regression model, trained per menu item
- **Feature engineering**:
  - Temporal: hour of day, day of week, cyclical sine/cosine encoding
  - Historical: lag features, rolling averages, momentum indicators
  - Environmental: user-configured contextual factors
- **Auto-retraining**: Backend watches PostgreSQL for changes and re-runs the inference pipeline automatically — no manual intervention required
- **Financial projection**: Each prediction includes mapped revenue, cost, and net profit using menu price/cost tables
- **Hourly granularity**: Forecasts broken down hour-by-hour (8:00–18:00) per item
- **Ingredient mapping**: Predictions are translated into ingredient quantities via recipe mappings for procurement planning

---

## 6. Infrastructure & Developer Experience

- **Quick start**: `start.bat` launches backend and frontend simultaneously from the root
- **Hot reload**: Vite-powered frontend with instant HMR during development
- **Auto-refresh**: All dashboards poll the backend every 5 seconds for live data
- **PostgreSQL integration**: All orders, users, and settings stored in a structured relational database
- **Android build**: Capacitor integration for building a native Android APK from the web app
- **Local network support**: Clear firewall setup guidance for mobile device testing on the same network
