# BiteSpeed Features

BiteSpeed is a lightweight, local food-ordering application designed with a primary focus on capturing strictly formatted machine-learning data for a canteen management system. Below are the core features of the project:

## 1. Food Ordering Interface (Frontend)
- **Modern Tech Stack:** Built using React and Vite, ensuring a fast and responsive user experience.
- **Sleek UI:** Styled with Tailwind CSS featuring a premium glass-card aesthetic, smooth micro-animations, and dynamic gradient buttons.
- **Intuitive Cart System:** Features a floating interactive shopping tray popup perfectly optimized for both desktop and mobile layouts.
- **Order Types:** Supports both "Dine-in" and "Pre-book" order placements with automated 5% pre-booking discounts.
- **Cross-Platform Readiness:** Wrapped with Capacitor, allowing the web app to be easily compiled into a native Android APK for mobile users.

## 2. ML Data Collection Pipeline (Backend)
- **Robust API:** A Node.js and Express backend that handles incoming order requests.
- **Real-Time Data Logging:** Every transaction is instantly recorded and strictly formatted into a centralized PostgreSQL master database.
- **ML-Ready Format:** The output is structured specifically for downstream consumption by machine learning models, eliminating the need for complex data wrangling.

## 3. Machine Learning & Demand Forecasting
- **XGBoost Integration:** Includes a dedicated Python script (`ml/xgb.py`) for training an XGBoost demand-forecasting model on the collected data.
- **Advanced Feature Engineering:** The model utilizes temporal features (time of day, day of week, cyclical encoding), lag/rolling statistics (momentum, historical averages), and environmental factors.
- **Automated Background Retraining:** The Node.js backend actively watches the database for changes and automatically executes the AI model in the background for real-time forecast caching.
- **Inference Script:** A helper script (`ml/get_predictions.py`) generates forecasts and highly accurate financial projections (revenue, cost, and net profit mapping) across the menu.

## 4. Admin & Management Console
- **Demand Analysis:** A dashboard for administrators to view live demand forecasts, actual vs. predicted metrics, and financial signals.
- **Interactive Visualization:** Recharts-powered visual representations of prediction data with detailed, hour-based breakdowns.
- **User Management:** A fully integrated UI for blocking, removing, and seamlessly resetting user passwords via an inline component.
- **Environmental Settings:** A centralized UI for managing external factors (like environmental settings) that might influence demand predictions.

## 5. Easy Local Development
- **Quick Start:** Includes a `start.bat` convenience script to simultaneously launch both the frontend and backend development servers.
- **Local Network Support:** Clear guidelines for opening firewall ports to allow testing on mobile devices connected to the same local network.
