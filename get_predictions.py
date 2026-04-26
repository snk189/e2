import pandas as pd
import json
import sys
import os
from datetime import datetime, timedelta
import numpy as np
import warnings

# Use user's trained model definition and data preparation correctly
from xgb import prepare_data, extract_features, build_model, get_meal_type

warnings.filterwarnings('ignore')

def predict_demand_for_date(target_date, df, model, feature_cols, encoded_cat_cols, lookups):
    month = target_date.month
    day_of_week = target_date.weekday()
    is_weekend = 1 if day_of_week >= 5 else 0
    
    holidays = ['01-01', '14-01', '26-01', '30-03', '03-04', '14-04', '01-05', '15-08', '02-10', '25-12']
    bridge_days = ['02-01', '23-01', '27-03', '02-04', '13-04', '30-04']
    
    is_holiday = 1 if target_date.strftime('%d-%m') in holidays else 0
    is_bridge_day = 1 if target_date.strftime('%d-%m') in bridge_days else 0
    
    items = df['item'].unique()
    time_slots = list(range(8, 19))
    res = {}
    
    if is_weekend == 1 or is_holiday == 1:
        for item in items:
            hourly = [{'time': t, 'predicted': 0} for t in time_slots]
            res[item] = {'total': 0, 'hourly': hourly}
        return res
    
    temp = lookups['m_temp'].get(month, 25.0)
    weather = lookups['m_weath'].get(month, 'sunny')
    season = lookups['m_seas'].get(month, 'winter')
    
    scenarios = []
    
    for item in items:
        item_avg_qty = lookups['item_avg'].get(item, 1.0)
        for t in time_slots:
            meal_type = get_meal_type(t)
            row = {
                'time_slot': t,
                'day_of_week': day_of_week,
                'is_weekend': is_weekend,
                'is_holiday': is_holiday,
                'is_bridge_day': is_bridge_day,
                'month': month,
                'temperature_celsius': temp,
                'is_peak_hour': 1 if t in [8,9,13,14] else 0,
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
    
    preds = model.predict(X_pred)
    scenarios_df['Total Expected Orders'] = np.round(preds).clip(min=0).astype(int)
    
    for item in items:
        item_df = scenarios_df[scenarios_df['item'] == item]
        hourly = []
        slot_groups = item_df.groupby('time_slot')['Total Expected Orders'].sum().to_dict()
        for t_slot in time_slots:
            hourly.append({'time': int(t_slot), 'predicted': int(slot_groups.get(t_slot, 0))})
            
        res[item] = {
            'total': int(item_df['Total Expected Orders'].sum()),
            'hourly': hourly
        }
    return res

def main():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        data_path = os.path.join(script_dir, 'data1.csv')
        
        if not os.path.exists(data_path):
            data_path = os.path.join(script_dir, 'data.csv')
            
        raw_df = pd.read_csv(data_path)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return

    import io
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    result = {}
    try:
        df, lookups = prepare_data(raw_df)
        X, y, feature_cols, encoded_cat_cols = extract_features(df)
        xgb_model = build_model(X, y, feature_cols)
        
        unique_items = df['item'].unique()
        
        today_date_str = datetime.now().strftime('%Y-%m-%d')
        yesterday_date_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        today_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == today_date_str]
        yesterday_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == yesterday_date_str]
        
        today_actual = today_df.groupby('item')['quantity'].sum().to_dict()
        yesterday_actual = yesterday_df.groupby('item')['quantity'].sum().to_dict()
        today_actual_hourly = today_df.groupby(['item', 'time_slot'])['quantity'].sum().to_dict()
        
        today_target = datetime.now()
        tomorrow_target = today_target + timedelta(days=1)
        
        today_pred = predict_demand_for_date(today_target, df, xgb_model, feature_cols, encoded_cat_cols, lookups)
        tomorrow_pred = predict_demand_for_date(tomorrow_target, df, xgb_model, feature_cols, encoded_cat_cols, lookups)
        
        # Extended price mappings
        price_map = {'dosa': 60, 'pizza': 150, 'sandwich': 50, 'milkshake': 80, 'tea': 20, 
                     'burger': 80, 'idly': 40, 'pulao': 100, 'coffee': 25, 'juice': 45, 'icecream': 50, 'samosa': 15, 'panipuri': 30}
                     
        cost_map = {'dosa': 25, 'pizza': 70, 'sandwich': 20, 'milkshake': 40, 'tea': 5, 
                     'burger': 40, 'idly': 15, 'pulao': 45, 'coffee': 10, 'juice': 20, 'icecream': 20, 'samosa': 5, 'panipuri': 10}
        
        total_revenue = 0
        total_cost = 0
        
        for item_key, qty in today_actual.items():
            selling_price = price_map.get(item_key, 0)
            cost_price = cost_map.get(item_key, 0)
            total_revenue += qty * selling_price
            total_cost += qty * cost_price
            
        net_profit = total_revenue - total_cost
        financials = {
            "totalRevenue": int(total_revenue),
            "totalCost": int(total_cost),
            "netProfit": int(net_profit)
        }
        
        current_hour = datetime.now().hour
        
        today_list = []
        for item in unique_items:
            item_pred = today_pred.get(item, {'total': 0, 'hourly': []})
            hourly_list = []
            for h in item_pred.get('hourly', []):
                t_slot = h['time']
                hr_actual = int(today_actual_hourly.get((item, t_slot), 0))
                hourly_list.append({
                    'time': t_slot,
                    'predicted': h['predicted'],
                    'actual': hr_actual
                })
            
            item_act = int(today_actual.get(item, 0))
            item_yest = int(yesterday_actual.get(item, 0))
            
            selling_price = price_map.get(item, 0)
            cost_price = cost_map.get(item, 0)
            item_profit = (selling_price - cost_price) * item_act
                
            today_list.append({
                "item": item.title(),
                "predicted": item_pred['total'],
                "actual": item_act,
                "yesterday": item_yest,
                "profit": int(item_profit),
                "hourly": hourly_list
            })
            
        tomorrow_list = []
        for item in unique_items:
            item_pred = tomorrow_pred.get(item, {'total': 0, 'hourly': []})
            hourly_list = []
            for h in item_pred.get('hourly', []):
                hourly_list.append({
                    'time': h['time'],
                    'predicted': h['predicted']
                })
                
            tomorrow_list.append({
                "item": item.title(),
                "predicted": item_pred['total'],
                "hourly": hourly_list
            })
            
        result = {
            "currentHour": current_hour,
            "financials": financials,
            "today": today_list,
            "tomorrow": tomorrow_list
        }
    except Exception as e:
        import traceback
        result = {"error": str(e), "trace": traceback.format_exc()}
    finally:
        sys.stdout = old_stdout
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()
