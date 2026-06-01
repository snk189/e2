import sys
import os
import json

# Update get_predictions.py
with open('ml/get_predictions.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_imports = '''import pandas as pd
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
'''
content = content[content.find('def get_meal_type'):]
content = new_imports + '\n' + content

# Replace build_model and get_forecast
def_build_model_idx = content.find('def build_model(')
content = content[:def_build_model_idx]

new_build_model_and_forecast = '''def run_optuna_tuning(X, y, split_idx, model_end_idx):
    print("\\n[WAIT] Running Optuna Hyperparameter Tuning for LightGBM...")

    import optuna as _optuna_module
    _optuna_module.logging.set_verbosity(_optuna_module.logging.WARNING)

    X_model = X.iloc[:model_end_idx]
    y_model = y.iloc[:model_end_idx]
    split_idx = min(split_idx, model_end_idx)

    X_train, X_test = X_model.iloc[:split_idx], X_model.iloc[split_idx:]
    y_train, y_test = y_model.iloc[:split_idx], y_model.iloc[split_idx:]

    def objective(trial):
        param = {
            'n_estimators':      trial.suggest_int('n_estimators', 300, 1000, step=100),
            'max_depth':         trial.suggest_int('max_depth', 6, 12),
            'learning_rate':     trial.suggest_float('learning_rate', 0.01, 0.1, log=True),
            'num_leaves':        trial.suggest_int('num_leaves', 31, 100),
            'min_child_samples': trial.suggest_int('min_child_samples', 10, 50),
            'subsample':         trial.suggest_float('subsample', 0.7, 1.0),
            'colsample_bytree':  trial.suggest_float('colsample_bytree', 0.7, 1.0),
            'reg_alpha':         trial.suggest_float('reg_alpha', 0.0, 0.5),
            'reg_lambda':        trial.suggest_float('reg_lambda', 0.0, 1.0),
            'random_state': 42,
            'n_jobs': -1,
            'verbose': -1
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

    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=15)

    best_params = study.best_params
    print(f"[OK] Optuna Complete! Best CV-MAE: {study.best_value:.4f} | Params: {best_params}")

    model = LGBMRegressor(**best_params, random_state=42, n_jobs=-1, verbose=-1)
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
    params = {'random_state': 42, 'n_jobs': -1, 'verbose': -1}
    
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
    final_model = LGBMRegressor(**params)
    final_model.fit(X_model, y_model)
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
            row['item_time_avg'] = his_val
            row['item_meal_avg'] = lookups['item_meal'].get((item, meal_type), item_avg_qty)
            row['item_weather_avg'] = lookups['item_weather'].get((item, weather), item_avg_qty)
            row['item_season_avg'] = lookups['item_season'].get((item, season), item_avg_qty)
            row['item_bridge_avg'] = lookups['item_bridge'].get((item, is_bridge_day), item_avg_qty)

            row['rolling_mean_3'] = lookups['latest_trend'].get((item, t), 0)
            row['rolling_mean_7'] = lookups['latest_trend'].get((item, t), 0)
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
'''
content = content + new_build_model_and_forecast
with open('ml/get_predictions.py', 'w', encoding='utf-8') as f:
    f.write(content)

# Update model_server.py
with open('ml/model_server.py', 'r', encoding='utf-8') as f:
    ms_content = f.read()

# Replace global models
ms_content = ms_content.replace('global_xgb_model = None\nglobal_cb_model = None', 'global_model = None')
ms_content = ms_content.replace('global_xgb_model, global_cb_model', 'global_model')

# In train_and_load_model
ms_content = ms_content.replace('xgb_model, cb_model = build_model(X, y, feature_cols, split_idx, model_end_idx)', 'model = build_model(X, y, feature_cols, split_idx, model_end_idx)')
ms_content = ms_content.replace('global_xgb_model = xgb_model\n        global_cb_model = cb_model', 'global_model = model')

save_model_old = '''        xgb_path = os.path.join(os.path.dirname(__file__), "xgboost_model.json")
        cb_path = os.path.join(os.path.dirname(__file__), "catboost_model.cbm")
        xgb_model.save_model(xgb_path)
        cb_model.save_model(cb_path)
        print(f"[SERVER] Models saved to {xgb_path} and {cb_path}")'''

save_model_new = '''        model_path = os.path.join(os.path.dirname(__file__), "lightgbm_model.txt")
        model.booster_.save_model(model_path)
        print(f"[SERVER] Model saved to {model_path}")'''
ms_content = ms_content.replace(save_model_old, save_model_new)

load_model_old = '''    model_path_xgb = os.path.join(os.path.dirname(__file__), "xgboost_model.json")
    model_path_cb = os.path.join(os.path.dirname(__file__), "catboost_model.cbm")
    if os.path.exists(model_path_xgb) and os.path.exists(model_path_cb):
        print("[SERVER] Found existing model files. Loading...")
        from xgboost import XGBRegressor
        from catboost import CatBoostRegressor
        
        xgb = XGBRegressor()
        xgb.load_model(model_path_xgb)
        
        cb = CatBoostRegressor()
        cb.load_model(model_path_cb)
        
        global_xgb_model = xgb
        global_cb_model = cb
        return True'''

load_model_new = '''    model_path = os.path.join(os.path.dirname(__file__), "lightgbm_model.txt")
    if os.path.exists(model_path):
        print("[SERVER] Found existing model file. Loading...")
        from lightgbm import LGBMRegressor
        
        model = LGBMRegressor(model_file=model_path)
        
        global_model = model
        return True'''
ms_content = ms_content.replace(load_model_old, load_model_new)

predict_old = '''res_data = get_forecast(target_date, global_df, (global_xgb_model, global_cb_model), global_feature_cols, global_lookups)'''
predict_new = '''res_data = get_forecast(target_date, global_df, global_model, global_feature_cols, global_lookups)'''
ms_content = ms_content.replace(predict_old, predict_new)

import_old = '''from get_predictions import prepare_data, extract_features, build_model, get_forecast'''
import_new = '''from get_predictions import prepare_data, extract_features, build_model, get_forecast, run_optuna_tuning'''
ms_content = ms_content.replace(import_old, import_new)

# Find if trigger optuna needs fixing
if 'def run_optuna_background():' not in ms_content:
    print('WARNING: run_optuna_background not found in model_server.py! I will add it if missing.')

ms_content = ms_content.replace('from xgboost import XGBRegressor\n', '')

with open('ml/model_server.py', 'w', encoding='utf-8') as f:
    f.write(ms_content)

print('Rewrite complete.')
