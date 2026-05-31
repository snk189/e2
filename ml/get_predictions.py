import pandas as pd
import numpy as np
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from xgboost import XGBRegressor
from catboost import CatBoostRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from datetime import datetime, timedelta
import json
import sys
import os
import warnings

warnings.filterwarnings('ignore')

def get_meal_type(t):
    if 7 <= t <= 10: return 'breakfast'
    elif 11 == t: return 'morning_snack'
    elif 12 <= t <= 14: return 'lunch'
    elif 15 <= t <= 16: return 'afternoon_snack'
    else: return 'evening'

def prepare_data(df):
    # Dynamic Feature Generation for natively dropped columns
    # Calculate effective_timestamp based on prebooking status
    df['effective_timestamp'] = pd.to_numeric(np.where(df['is_prebooking'] == 1, df['prebooking_datetime'], df['order_timestamp']), errors='coerce')
    
    # Convert to datetime and adjust to local time if needed (assuming local timezone or naive works)
    # We will derive date_obj and time_slot directly from effective_timestamp
    df['effective_datetime'] = pd.to_datetime(df['effective_timestamp'], unit='s')
    df['date_obj'] = df['effective_datetime'].dt.normalize()
    df['time_slot'] = df['effective_datetime'].dt.hour
    
    # Do not drop data after 29-05-2026 here, so we can check actuals for today!
    start_date = pd.to_datetime('01-01-2026', format='%d-%m-%Y')
    df = df[(df['date_obj'] >= start_date)]
    
    # Enforce Canteen Operating Hours (8 AM to 6 PM)
    df = df[(df['time_slot'] >= 8) & (df['time_slot'] < 18)]
    
    df['day_of_week'] = df['date_obj'].dt.dayofweek
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    df['month'] = df['date_obj'].dt.month
    
    df['meal_type'] = df['time_slot'].apply(get_meal_type)
    df['is_peak_hour'] = df['time_slot'].isin([8, 9, 13, 14]).astype(int)
    
    df = df.sort_values(['date_obj', 'time_slot']).reset_index(drop=True)
    
    # Lag features must use shift(1) to avoid leaking current row's target
    df['prev_qty'] = df.groupby('item')['quantity'].shift(1).fillna(0)
    df['rolling_mean_3'] = df.groupby('item')['quantity'].shift(1).rolling(3).mean().reset_index(level=0, drop=True).fillna(0)
    df['rolling_mean_7'] = df.groupby('item')['quantity'].shift(1).rolling(7).mean().reset_index(level=0, drop=True).fillna(0)
    df['lag_7'] = df.groupby('item')['quantity'].shift(7).fillna(0)
    df['momentum'] = df['rolling_mean_3'] - df['rolling_mean_7']

    # Chronologically split before building averages to prevent Data Leakage!
    # True Forecasting cut: train up to Apr 20, test from Apr 21 onwards
    cutoff_date = pd.to_datetime('20-04-2026', format='%d-%m-%Y')
    split_idx_candidates = df[df['date_obj'] > cutoff_date].index
    split_idx = split_idx_candidates[0] if len(split_idx_candidates) > 0 else len(df)
    
    train_df = df.iloc[:split_idx].copy()
    
    # Historical Dictionaries strictly from training data
    hist_avg = train_df.groupby(['item', 'day_of_week', 'time_slot'])['quantity'].mean().to_dict()
    item_meal_dict = train_df.groupby(['item', 'meal_type'])['quantity'].mean().to_dict()
    item_weather_dict = train_df.groupby(['item', 'weather'])['quantity'].mean().to_dict()
    item_season_dict = train_df.groupby(['item', 'season'])['quantity'].mean().to_dict()
    item_bridge_dict = train_df.groupby(['item', 'is_bridge_day'])['quantity'].mean().to_dict()
    item_avg = train_df.groupby('item')['quantity'].mean().to_dict()

    # Safely apply mappings across the entire dataframe
    df['item_time_avg'] = df.apply(lambda r: hist_avg.get((r['item'], r['day_of_week'], r['time_slot']), item_avg.get(r['item'], 0)), axis=1)
    df['item_meal_avg'] = df.apply(lambda r: item_meal_dict.get((r['item'], r['meal_type']), item_avg.get(r['item'], 0)), axis=1)
    df['item_weather_avg'] = df.apply(lambda r: item_weather_dict.get((r['item'], r['weather']), item_avg.get(r['item'], 0)), axis=1)
    df['item_season_avg'] = df.apply(lambda r: item_season_dict.get((r['item'], r['season']), item_avg.get(r['item'], 0)), axis=1)
    df['item_bridge_avg'] = df.apply(lambda r: item_bridge_dict.get((r['item'], r['is_bridge_day']), item_avg.get(r['item'], 0)), axis=1)

    df['weekend_lunch'] = df['is_weekend'] * (df['meal_type'] == 'lunch').astype(int)
    df['user_avg_qty'] = train_df['quantity'].mean()

    df['time_slot_sin'] = np.sin(2 * np.pi * df['time_slot'] / 24.0)
    df['time_slot_cos'] = np.cos(2 * np.pi * df['time_slot'] / 24.0)
    df['day_of_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7.0)
    df['day_of_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7.0)
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12.0)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12.0)
    
    latest_trend = df.groupby(['item', 'time_slot']).last()['rolling_mean_3'].to_dict()
    latest_lag7 = df.groupby(['item', 'time_slot']).last()['lag_7'].to_dict()
    
    monthly_temp = train_df.groupby('month')['temperature_celsius'].mean().to_dict()
    monthly_weather = train_df.groupby('month')['weather'].agg(lambda x: x.mode()[0]).to_dict()
    monthly_season = train_df.groupby('month')['season'].agg(lambda x: x.mode()[0]).to_dict()

    lookups = {
        'hist_avg': hist_avg,
        'item_meal': item_meal_dict,
        'item_weather': item_weather_dict,
        'item_season': item_season_dict,
        'item_bridge': item_bridge_dict,
        'item_avg': item_avg,
        'latest_trend': latest_trend,
        'latest_lag7': latest_lag7,
        'm_temp': monthly_temp,
        'm_weath': monthly_weather,
        'm_seas': monthly_season,
        'user_avg_qty': train_df['quantity'].mean()
    }

    model_cutoff = pd.to_datetime('29-05-2026', format='%d-%m-%Y')
    model_end_idx_candidates = df[df['date_obj'] > model_cutoff].index
    model_end_idx = model_end_idx_candidates[0] if len(model_end_idx_candidates) > 0 else len(df)

    return df, lookups, split_idx, model_end_idx

def extract_features(df):
    cat_cols = ['item', 'season', 'weather', 'meal_type']
    df_encoded = pd.get_dummies(df, columns=cat_cols, drop_first=False)
    
    numeric_cols = [
        'time_slot', 'day_of_week', 'is_weekend', 'is_holiday', 'is_bridge_day', 
        'month', 'temperature_celsius', 'is_peak_hour', 'is_exam_week', 
        'prev_qty', 'rolling_mean_3', 'rolling_mean_7', 'lag_7', 'momentum',
        'item_time_avg', 'item_meal_avg', 'item_weather_avg', 'item_season_avg', 'item_bridge_avg',
        'weekend_lunch', 'user_avg_qty',
        'time_slot_sin', 'time_slot_cos', 'day_of_week_sin', 'day_of_week_cos',
        'month_sin', 'month_cos'
    ]
    
    encoded_cat_cols = [c for c in df_encoded.columns if any(c.startswith(prefix + '_') for prefix in cat_cols) and c not in numeric_cols]
    
    feature_cols = numeric_cols + encoded_cat_cols
    
    for col in encoded_cat_cols:
        df_encoded[col] = df_encoded[col].astype(int)
        
    X = df_encoded[feature_cols].copy()
    y = df_encoded['quantity']
    
    return X, y, feature_cols, encoded_cat_cols

def build_model(X, y, feature_cols, split_idx, model_end_idx):
    X_model = X.iloc[:model_end_idx]
    y_model = y.iloc[:model_end_idx]
    
    # split_idx is for hyperparam tuning. Make sure it doesn't exceed model_end_idx
    split_idx = min(split_idx, model_end_idx)
    
    X_train, X_test = X_model.iloc[:split_idx], X_model.iloc[split_idx:]
    y_train, y_test = y_model.iloc[:split_idx], y_model.iloc[split_idx:]
    
    print("\n[WAIT] Tuning XGBoost Model using GridSearchCV (Takes a few seconds)...")
    param_grid = {
        'n_estimators': [300, 500, 700],
        'max_depth': [6, 8],
        'learning_rate': [0.03, 0.05, 0.1]
    }
    
    xgb = XGBRegressor(random_state=42, n_jobs=-1)
    tscv = TimeSeriesSplit(n_splits=3)
    grid = GridSearchCV(xgb, param_grid, cv=tscv, scoring='neg_mean_absolute_error', n_jobs=-1)
    grid.fit(X_train, y_train)

    print("[WAIT] Training Final XGBoost Model...")
    xgb_final = XGBRegressor(**grid.best_params_, random_state=42, n_jobs=-1)
    xgb_final.fit(X_model, y_model)
    print("[OK] Final XGBoost Model Trained Successfully.")

    print("[WAIT] Training Final CatBoost Model...")
    cb_final = CatBoostRegressor(
        iterations=1000,
        learning_rate=0.05,
        depth=6,
        loss_function='RMSE',
        verbose=0,
        random_seed=42,
        allow_writing_files=False
    )
    cb_final.fit(X_model, y_model)
    print("[OK] Final CatBoost Model Trained Successfully.")

    return {
        "xgb": xgb_final,
        "cb": cb_final
    }

def get_forecast(target_date, df, model, feature_cols, lookups):
    month = target_date.month
    day_of_week = target_date.weekday()
    is_weekend = 1 if day_of_week >= 5 else 0

    holidays = ['01-01', '14-01', '26-01', '30-03', '03-04', '14-04', '01-05', '15-08', '02-10', '25-12']
    bridge_days = ['02-01', '23-01', '27-03', '02-04', '13-04', '30-04']

    is_holiday = 1 if target_date.strftime('%d-%m') in holidays else 0
    is_bridge_day = 1 if target_date.strftime('%d-%m') in bridge_days else 0

    if is_weekend == 1 or is_holiday == 1:
        items = df['item'].unique()
        time_slots = sorted(df['time_slot'].unique())
        res = {}
        for item in items:
            hourly = [{'time': int(t), 'predicted': 0} for t in time_slots]
            res[item] = {'total': 0, 'hourly': hourly}
        return res

    # Automatically fallback to historical averages
    temp = lookups['m_temp'].get(month, 25.0)
    weather = lookups['m_weath'].get(month, 'sunny')
    season = lookups['m_seas'].get(month, 'winter')

    items = df['item'].unique()
    time_slots = sorted(df['time_slot'].unique())

    scenarios = []
    for item in items:
        for t in time_slots:
            meal_type = get_meal_type(t)
            item_avg_qty = lookups['item_avg'].get(item, 1.0)

            row = {
                'time_slot': t,
                'day_of_week': day_of_week,
                'is_weekend': is_weekend,
                'is_holiday': is_holiday,
                'is_bridge_day': is_bridge_day,
                'month': month,
                'temperature_celsius': temp,
                'is_peak_hour': 1 if t in [8, 9, 13, 14] else 0,
                'is_exam_week': 0,
                'user_avg_qty': lookups['user_avg_qty'] if 'user_avg_qty' in lookups else 30.0,
            }

            his_val = lookups['hist_avg'].get((item, day_of_week, t), 0)
            row['prev_qty'] = his_val
            row['item_time_avg'] = his_val
            row['item_meal_avg'] = lookups['item_meal'].get((item, meal_type), 0)
            row['item_weather_avg'] = lookups['item_weather'].get((item, weather), 0)
            row['item_season_avg'] = lookups['item_season'].get((item, season), 0)
            row['item_bridge_avg'] = lookups['item_bridge'].get((item, is_bridge_day), item_avg_qty)

            row['rolling_mean_3'] = lookups['latest_trend'].get((item, t), 0)
            row['rolling_mean_7'] = row['rolling_mean_3']
            row['lag_7'] = lookups['latest_lag7'].get((item, t), 0)
            row['momentum'] = 0
            row['weekend_lunch'] = row['is_weekend'] * (1 if meal_type == 'lunch' else 0)

            row['time_slot_sin'] = np.sin(2 * np.pi * t / 24.0)
            row['time_slot_cos'] = np.cos(2 * np.pi * t / 24.0)
            row['day_of_week_sin'] = np.sin(2 * np.pi * day_of_week / 7.0)
            row['day_of_week_cos'] = np.cos(2 * np.pi * day_of_week / 7.0)
            row['month_sin'] = np.sin(2 * np.pi * month / 12.0)
            row['month_cos'] = np.cos(2 * np.pi * month / 12.0)

            row['item'] = item
            row['season'] = season
            row['weather'] = weather
            row['meal_type'] = meal_type

            scenarios.append(row)

    scenarios_df = pd.DataFrame(scenarios)
    scenarios_df_encoded = pd.get_dummies(scenarios_df, columns=['item', 'season', 'weather', 'meal_type'])

    for col in feature_cols:
        if col not in scenarios_df_encoded.columns:
            scenarios_df_encoded[col] = 0

    X_pred = scenarios_df_encoded[feature_cols].astype(float)
    
    xgb_preds = model["xgb"].predict(X_pred)
    cb_preds = model["cb"].predict(X_pred)
    
    preds = 0.3 * xgb_preds + 0.7 * cb_preds
    
    scenarios_df['Predicted'] = np.round(preds).clip(min=0).astype(int)

    res = {}
    for item in items:
        item_df = scenarios_df[scenarios_df['item'] == item]
        hourly = []
        slot_groups = item_df.groupby('time_slot')['Predicted'].sum().to_dict()
        for t in time_slots:
            hourly.append({'time': int(t), 'predicted': int(slot_groups.get(t, 0))})
        res[item] = {
            'total': int(item_df['Predicted'].sum()),
            'hourly': hourly
        }
    return res

