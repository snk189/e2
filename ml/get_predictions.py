import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from lightgbm import LGBMRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from datetime import datetime, timedelta
import json
import sys
import os
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

def run_optuna_tuning(X, y, split_idx, model_end_idx):
    print("\n[WAIT] Running Optuna Hyperparameter Tuning for LightGBM...")

    import optuna as _optuna_module
    _optuna_module.logging.set_verbosity(_optuna_module.logging.WARNING)

    X_model = X.iloc[:model_end_idx]
    y_model = y.iloc[:model_end_idx]
    split_idx = min(split_idx, model_end_idx)

    X_train, X_test = X_model.iloc[:split_idx], X_model.iloc[split_idx:]
    y_train, y_test = y_model.iloc[:split_idx], y_model.iloc[split_idx:]

    progress_file = os.path.join(os.path.dirname(__file__), "training_progress.json")
    iterations_file = os.path.join(os.path.dirname(__file__), "optuna_history.json")
    try:
        with open(progress_file, "w") as f:
            json.dump({"progress": 0, "status": "optuna"}, f)
        with open(iterations_file, "w") as f:
            json.dump([], f)
    except Exception:
        pass

    def objective(trial):
        param = {
            'n_estimators':      trial.suggest_int('n_estimators', 500, 2000, step=100),
            'max_depth':         trial.suggest_int('max_depth', 5, 15),
            'learning_rate':     trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'num_leaves':        trial.suggest_int('num_leaves', 20, 150),
            'min_child_samples': trial.suggest_int('min_child_samples', 10, 100),
            'subsample':         trial.suggest_float('subsample', 0.5, 1.0),
            'subsample_freq':    trial.suggest_int('subsample_freq', 1, 7),
            'colsample_bytree':  trial.suggest_float('colsample_bytree', 0.5, 1.0),
            'reg_alpha':         trial.suggest_float('reg_alpha', 0.0, 5.0),
            'reg_lambda':        trial.suggest_float('reg_lambda', 0.0, 5.0),
            'random_state': 42,
            'n_jobs': 1,
            'verbose': 1,
            'device_type': 'gpu',
            'gpu_platform_id': 1,
            'gpu_device_id': 0
        }

        tscv = TimeSeriesSplit(n_splits=3)
        scores = []
        for train_index, valid_index in tscv.split(X_train):
            cv_X_train, cv_X_valid = X_train.iloc[train_index], X_train.iloc[valid_index]
            cv_y_train, cv_y_valid = y_train.iloc[train_index], y_train.iloc[valid_index]

            model = LGBMRegressor(**param)
            model.fit(cv_X_train, cv_y_train)
            preds = model.predict(cv_X_valid)
            scores.append(mean_absolute_error(cv_y_valid, preds))

        return np.mean(scores)

    def optuna_callback(study, trial):
        progress_file = os.path.join(os.path.dirname(__file__), "training_progress.json")
        iterations_file = os.path.join(os.path.dirname(__file__), "optuna_history.json")
        progress_pct = int((trial.number + 1) / 40 * 100)
        
        try:
            with open(progress_file, "w") as f:
                json.dump({"progress": progress_pct, "status": "optuna"}, f)
        except Exception:
            pass
            
        try:
            history = []
            if os.path.exists(iterations_file):
                with open(iterations_file, "r") as f:
                    history = json.load(f)
            history.append({
                "trial": trial.number + 1,
                "value_mae": trial.value,
                "params": trial.params
            })
            with open(iterations_file, "w") as f:
                json.dump(history, f, indent=2)
        except Exception:
            pass

    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=40, callbacks=[optuna_callback])

    best_params = study.best_params
    print(f"[OK] Optuna Complete! Best CV-MAE: {study.best_value:.4f} | Params: {best_params}")

    model = LGBMRegressor(**best_params, random_state=42, n_jobs=1, verbose=1, device_type='gpu', gpu_platform_id=1, gpu_device_id=0)
    model.fit(X_train, y_train)
    y_pred         = model.predict(X_test)
    y_pred_rounded = np.round(y_pred).clip(min=0)

    r2        = r2_score(y_test, y_pred)
    mae       = mean_absolute_error(y_test, y_pred)
    rmse      = np.sqrt(mean_squared_error(y_test, y_pred))
    exact_acc = np.mean(y_pred_rounded == y_test) * 100

    ist_time = datetime.utcnow() + timedelta(hours=5, minutes=30)
    last_run_ist = ist_time.strftime('%Y-%m-%d %H:%M:%S')

    optuna_data = {
        "params": best_params,
        "last_run_ist": last_run_ist,
        "metrics": {
            "r2": round(r2, 4),
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "exact_pct": round(exact_acc, 2)
        }
    }
    optuna_file = os.path.join(os.path.dirname(__file__), "optuna_params.json")
    with open(optuna_file, "w") as f:
        json.dump(optuna_data, f, indent=4)

    print(f"[OK] Saved Optuna parameters to {optuna_file}")

def build_model(X, y, feature_cols, split_idx, model_end_idx):
    X_model = X.iloc[:model_end_idx]
    y_model = y.iloc[:model_end_idx]
    
    # Load stored params if available
    optuna_file = os.path.join(os.path.dirname(__file__), "optuna_params.json")
    params = {'random_state': 42, 'n_jobs': 1, 'verbose': 1, 'device_type': 'gpu', 'gpu_platform_id': 1, 'gpu_device_id': 0}
    
    if os.path.exists(optuna_file):
        try:
            with open(optuna_file, "r") as f:
                data = json.load(f)
                if "params" in data:
                    params.update(data["params"])
                    print(f"[OK] Loaded Optuna parameters from {optuna_file}")
        except Exception as e:
            print(f"[WARNING] Failed to load optuna parameters: {e}")
    else:
        print(f"[WARNING] No optuna_params.json found. Using default LightGBM parameters.")

    print("[WAIT] Training Final LightGBM Model...")
    
    progress_file = os.path.join(os.path.dirname(__file__), "training_progress.json")
    try:
        with open(progress_file, "w") as f:
            json.dump({"progress": 0, "status": "model"}, f)
    except Exception:
        pass
        
    def lgb_progress_callback(env):
        progress_file = os.path.join(os.path.dirname(__file__), "training_progress.json")
        pct = int((env.iteration + 1) / env.end_iteration * 100)
        if pct % 5 == 0 or pct == 100:
            try:
                with open(progress_file, "w") as f:
                    json.dump({"progress": pct, "status": "model"}, f)
            except Exception:
                pass

    final_model = LGBMRegressor(**params)
    final_model.fit(X_model, y_model, callbacks=[lgb_progress_callback])
    
    try:
        with open(progress_file, "w") as f:
            json.dump({"progress": 100, "status": "idle"}, f)
    except Exception:
        pass
        
    print("[OK] Final LightGBM Model Trained Successfully.")

    return final_model

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
    
    preds = model.predict(X_pred)
    scenarios_df['Predicted'] = np.round(preds).clip(min=0).astype(int)
    
    # Enforce 0 demand for holidays/weekends (Sunday is 6)
    scenarios_df.loc[scenarios_df['day_of_week'] == 6, 'Predicted'] = 0

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
