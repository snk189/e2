import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from lightgbm import LGBMRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from datetime import datetime, timedelta
import json
import sys
import os
import joblib
import warnings
import optuna

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
    df['effective_datetime'] = pd.to_datetime(df['effective_timestamp'], unit='s', utc=True).dt.tz_convert('Asia/Kolkata')
    df['date_obj'] = df['effective_datetime'].dt.normalize().dt.tz_localize(None)
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
    df['prev_qty'] = df.groupby(['item', 'time_slot'])['quantity'].shift(1).fillna(0)
    df['lag_1'] = df.groupby(['item', 'time_slot'])['quantity'].shift(1).fillna(0)
    df['lag_2'] = df.groupby(['item', 'time_slot'])['quantity'].shift(2).fillna(0)
    df['lag_3'] = df.groupby(['item', 'time_slot'])['quantity'].shift(3).fillna(0)
    df['rolling_mean_3'] = df.groupby(['item', 'time_slot'])['quantity'].transform(lambda x: x.shift(1).rolling(3).mean()).fillna(0)
    df['rolling_mean_7'] = df.groupby(['item', 'time_slot'])['quantity'].transform(lambda x: x.shift(1).rolling(7).mean()).fillna(0)
    df['rolling_mean_14'] = df.groupby(['item', 'time_slot'])['quantity'].transform(lambda x: x.shift(1).rolling(14).mean()).fillna(0)
    df['item_variance'] = df.groupby(['item', 'time_slot'])['quantity'].transform(lambda x: x.shift(1).rolling(7).var()).fillna(0)
    df['lag_7'] = df.groupby(['item', 'time_slot'])['quantity'].shift(7).fillna(0)
    df['momentum'] = df['rolling_mean_3'] - df['rolling_mean_7']
    
    # --- Event-Based Flags ---
    df['is_morning_break'] = (df['time_slot'] == 11).astype(int)
    df['is_lunch_break'] = df['time_slot'].isin([13, 14]).astype(int)
    df['is_afternoon_break'] = (df['time_slot'] == 16).astype(int)
    df['extreme_heat'] = (df['temperature_celsius'] >= 35).astype(int)
    df['is_social_peak'] = ((df['time_slot'] >= 15) & (df['is_weekend'] == 0)).astype(int)
    df['is_crowd_burst'] = (df['momentum'] > 15).astype(int)
    
    # New Mocks
    df['is_event_festival'] = df['date_obj'].apply(lambda d: 1 if d.day in [14, 15, 25, 26, 31] else 0)
    df['exam_intensity'] = df['date_obj'].apply(lambda d: 0.85 if d.month in [4, 5, 11, 12] else (0.4 if d.month in [3, 10] else 0.1))
    df['attendance_estimate'] = df.apply(lambda r: 0.3 if r['is_weekend'] == 1 else (0.6 if r['exam_intensity'] > 0.6 else 0.95), axis=1)
    # -------------------------

    # Chronologically split before building averages to prevent Data Leakage!
    # True Forecasting cut: train up to Apr 20, test from Apr 21 onwards
    cutoff_date = pd.to_datetime('20-05-2026', format='%d-%m-%Y')
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
    latest_prev = df.groupby(['item', 'time_slot']).last()['prev_qty'].to_dict()
    latest_lag1 = df.groupby(['item', 'time_slot']).last()['lag_1'].to_dict()
    latest_lag2 = df.groupby(['item', 'time_slot']).last()['lag_2'].to_dict()
    latest_lag3 = df.groupby(['item', 'time_slot']).last()['lag_3'].to_dict()
    latest_rolling14 = df.groupby(['item', 'time_slot']).last()['rolling_mean_14'].to_dict()
    latest_item_variance = df.groupby(['item', 'time_slot']).last()['item_variance'].to_dict()
    
    monthly_temp = df.groupby('month')['temperature_celsius'].mean().to_dict()
    monthly_weather = df.groupby('month')['weather'].agg(lambda x: x.mode()[0]).to_dict()
    monthly_season = df.groupby('month')['season'].agg(lambda x: x.mode()[0]).to_dict()
    
    lookups = {
        'hist_avg': hist_avg,
        'item_meal': item_meal_dict,
        'item_weather': item_weather_dict,
        'item_season': item_season_dict,
        'item_bridge': item_bridge_dict,
        'item_avg': item_avg,
        'latest_trend': latest_trend,
        'latest_lag7': latest_lag7,
        'latest_prev': latest_prev,
        'latest_lag1': latest_lag1,
        'latest_lag2': latest_lag2,
        'latest_lag3': latest_lag3,
        'latest_rolling14': latest_rolling14,
        'latest_item_variance': latest_item_variance,
        'm_temp': monthly_temp,
        'm_weath': monthly_weather,
        'm_seas': monthly_season,
        'user_avg_qty': train_df['quantity'].mean()
    }

    model_cutoff = pd.to_datetime('31-05-2026', format='%d-%m-%Y')
    model_end_idx_candidates = df[df['date_obj'] > model_cutoff].index
    model_end_idx = model_end_idx_candidates[0] if len(model_end_idx_candidates) > 0 else len(df)

    return df, lookups, split_idx, model_end_idx

def extract_features(df):
    cat_cols = ['item', 'season', 'weather', 'meal_type']
    df_encoded = pd.get_dummies(df, columns=cat_cols, drop_first=False)
    
    numeric_cols = [
        'time_slot', 'day_of_week', 'is_weekend', 'is_holiday', 'is_bridge_day', 
        'month', 'temperature_celsius', 'is_peak_hour', 'is_exam_week', 
        'prev_qty', 'lag_1', 'lag_2', 'lag_3', 'rolling_mean_3', 'rolling_mean_7', 'rolling_mean_14', 'lag_7', 'momentum',
        'item_variance', 'is_morning_break', 'is_lunch_break', 'is_afternoon_break', 
        'extreme_heat', 'is_social_peak', 'is_crowd_burst',
        'is_event_festival', 'exam_intensity', 'attendance_estimate',
        'item_time_avg', 'item_meal_avg', 'item_bridge_avg',
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

def train_split_models(X, y, split_idx, model_end_idx):
    print("\n[WAIT] Training Split Models with Pre-Tuned Parameters...")

    X_model = X.iloc[:model_end_idx]
    y_model = y.iloc[:model_end_idx]
    
    # Split the dataset into group 1 and group 2
    group1_items = ['idly', 'dosa', 'pulao', 'sandwich', 'burger', 'pizza', 'samosa', 'panipuri']
    
    # Create mask for group 1 (checking if any of the group 1 items are 1)
    g1_cols = [f'item_{it}' for it in group1_items if f'item_{it}' in X_model.columns]
    mask_g1 = X_model[g1_cols].sum(axis=1) > 0
    
    X_train = X_model.iloc[:split_idx]
    y_train = y_model.iloc[:split_idx]
    
    mask_g1_train = X_train[g1_cols].sum(axis=1) > 0

    params_1 = {
        "n_estimators": 600,
        "max_depth": 11,
        "learning_rate": 0.017903596614795746,
        "num_leaves": 116,
        "min_child_samples": 10,
        "subsample": 0.8674424840356335,
        "subsample_freq": 6,
        "colsample_bytree": 0.9662520284301941,
        "reg_alpha": 1.2088107341929515,
        "reg_lambda": 0.03823277548596726,
        "random_state": 42,
        "n_jobs": 1,
        "verbose": 1,
        "device_type": "gpu",
        "gpu_platform_id": 1,
        "gpu_device_id": 0
    }

    params_2 = {
        "n_estimators": 1900,
        "max_depth": 11,
        "learning_rate": 0.03337919294971768,
        "num_leaves": 125,
        "min_child_samples": 10,
        "subsample": 0.8309655086376062,
        "subsample_freq": 1,
        "colsample_bytree": 0.9370465004286387,
        "reg_alpha": 2.251953295895595,
        "reg_lambda": 4.369122460386151,
        "random_state": 42,
        "n_jobs": 1,
        "verbose": 1,
        "device_type": "gpu",
        "gpu_platform_id": 1,
        "gpu_device_id": 0
    }

    print("[INFO] Training Model 1...")
    model_1 = LGBMRegressor(**params_1)
    model_1.fit(X_train[mask_g1_train], y_train[mask_g1_train])
    
    print("[INFO] Training Model 2...")
    model_2 = LGBMRegressor(**params_2)
    model_2.fit(X_train[~mask_g1_train], y_train[~mask_g1_train])
    
    # Save as a dict
    models = {'model_1': model_1, 'model_2': model_2, 'group1_items': group1_items}
    joblib.dump(models, 'lightgbm_model.joblib')
    print("[OK] Split Models Trained and Saved Successfully.")

def build_model(X, y, feature_cols, split_idx, model_end_idx):
    train_split_models(X, y, split_idx, model_end_idx)
    return joblib.load('lightgbm_model.joblib')

def get_forecast(target_date, df, model, feature_cols, lookups):
    month = target_date.month
    day_of_week = target_date.weekday()
    is_weekend = 1 if day_of_week >= 5 else 0

    holidays = ['01-01', '14-01', '26-01', '30-03', '03-04', '14-04', '01-05', '15-08', '02-10', '25-12']
    bridge_days = ['02-01', '23-01', '27-03', '02-04', '13-04', '30-04']

    is_holiday = 1 if target_date.strftime('%d-%m') in holidays else 0
    is_bridge_day = 1 if target_date.strftime('%d-%m') in bridge_days else 0

    # Ensure 0 predictions for holidays and weekends (Sunday=6, Saturday=5)
    if is_weekend == 1 or is_holiday == 1:
        items = df['item'].unique()
        time_slots = sorted(df['time_slot'].unique())
        res = {}
        for item in items:
            hourly = [{'time': int(t), 'predicted': 0} for t in time_slots]
            res[item] = {'total': 0, 'hourly': hourly}
        return res

    temp = lookups['m_temp'].get(month, 25.0)
    weather = lookups['m_weath'].get(month, 'sunny')
    season = lookups['m_seas'].get(month, 'winter')

    items = df['item'].unique()
    time_slots = sorted(df['time_slot'].unique())

    res = {}
    for item in items:
        item_rows = []
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
                'is_morning_break': 1 if t == 11 else 0,
                'is_lunch_break': 1 if t in [13, 14] else 0,
                'is_afternoon_break': 1 if t == 16 else 0,
                'extreme_heat': 1 if temp >= 35 else 0,
                'is_social_peak': 1 if t >= 15 and is_weekend == 0 else 0,
                'is_crowd_burst': 0,
            }

            his_val = lookups['hist_avg'].get((item, day_of_week, t), item_avg_qty)
            row['prev_qty'] = lookups['latest_prev'].get((item, t), his_val)
            row['lag_1'] = lookups['latest_lag1'].get((item, t), his_val)
            row['lag_2'] = lookups['latest_lag2'].get((item, t), his_val)
            row['lag_3'] = lookups['latest_lag3'].get((item, t), his_val)
            
            row['item_time_avg'] = his_val
            row['item_meal_avg'] = lookups['item_meal'].get((item, meal_type), item_avg_qty)
            row['item_weather_avg'] = lookups['item_weather'].get((item, weather), item_avg_qty)
            row['item_season_avg'] = lookups['item_season'].get((item, season), item_avg_qty)
            row['item_bridge_avg'] = lookups['item_bridge'].get((item, is_bridge_day), item_avg_qty)

            row['rolling_mean_3'] = lookups['latest_trend'].get((item, t), 0)
            row['rolling_mean_7'] = lookups['latest_trend'].get((item, t), 0)
            row['rolling_mean_14'] = lookups['latest_rolling14'].get((item, t), 0)
            row['item_variance'] = lookups['latest_item_variance'].get((item, t), 0)
            row['lag_7'] = lookups['latest_lag7'].get((item, t), 0)
            row['momentum'] = 0
            row['weekend_lunch'] = row['is_weekend'] * (1 if meal_type == 'lunch' else 0)

            row['time_slot_sin'] = np.sin(2 * np.pi * t / 24.0)
            row['time_slot_cos'] = np.cos(2 * np.pi * t / 24.0)
            row['day_of_week_sin'] = np.sin(2 * np.pi * day_of_week / 7.0)
            row['day_of_week_cos'] = np.cos(2 * np.pi * day_of_week / 7.0)
            row['month_sin'] = np.sin(2 * np.pi * month / 12.0)
            row['month_cos'] = np.cos(2 * np.pi * month / 12.0)

            # Categorical encoding columns
            for cat in ['item', 'season', 'weather', 'meal_type']:
                prefix = cat
                val = item if cat == 'item' else (season if cat == 'season' else (weather if cat == 'weather' else meal_type))
                row[f'{prefix}_{val}'] = 1

            item_rows.append(row)

        X_pred = pd.DataFrame(item_rows)
        for c in feature_cols:
            if c not in X_pred.columns:
                X_pred[c] = 0
        X_pred = X_pred[feature_cols]

        if hasattr(model, 'keys') and 'model_1' in model:
            if item in model['group1_items']:
                target_model = model['model_1']
            else:
                target_model = model['model_2']
        else:
            target_model = model

        preds = np.round(target_model.predict(X_pred)).clip(min=0)
        
        hourly = []
        total = 0
        for i, t in enumerate(time_slots):
            val = int(preds[i])
            if day_of_week == 6:  # Enforce 0 demand for holidays/weekends (Sunday is 6)
                val = 0
            hourly.append({'time': int(t), 'predicted': val})
            total += val
            
        res[item] = {
            'total': total,
            'hourly': hourly
        }
    return res
