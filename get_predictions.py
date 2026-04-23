import pandas as pd
import json
import sys
import os
from datetime import datetime, timedelta
import numpy as np
import warnings
from xgb import prepare_data, extract_features, build_and_evaluate_model

warnings.filterwarnings('ignore')

def get_forecast(df, model, target_date, item_cols, feature_cols, unique_items, hist_avg_dict, prebook_avg_dict, item_avg_dict, latest_trend_dict, meal_avg_dict, item_prebook_ratio_dict, available_time_slots):
    day_of_week = target_date.weekday()
    is_weekend = int(day_of_week in [5, 6])
    is_monday = int(day_of_week == 0)
    is_friday = int(day_of_week == 4)
    is_sunday = int(day_of_week == 6)
    
    day_of_month = target_date.day
    is_pay_week = int(day_of_month >= 25 or day_of_month <= 5)
    
    month = target_date.month
    month_sin = np.sin(2 * np.pi * month / 12.0)
    month_cos = np.cos(2 * np.pi * month / 12.0)
    
    day_sin = np.sin(2 * np.pi * day_of_week / 7.0)
    day_cos = np.cos(2 * np.pi * day_of_week / 7.0)
    
    scenarios = []
    for item_str in unique_items:
        is_heavy_meal = int(item_str in ['pizza', 'dosa'])
        
        item_one_hot = {col: 0 for col in item_cols}
        if f'item_{item_str}' in item_cols:
            item_one_hot[f'item_{item_str}'] = 1
        
        for t_slot in available_time_slots:
            lookup_key = (item_str, day_of_week, t_slot)
            hist_avg = hist_avg_dict.get(lookup_key, item_avg_dict.get(item_str, 1.0))
                
            is_breakfast = int(8 <= t_slot <= 10)
            is_lunch = int(11 <= t_slot <= 14)
            is_evening = int(15 <= t_slot <= 18)
            
            time_sin = np.sin(2 * np.pi * t_slot / 24.0)
            time_cos = np.cos(2 * np.pi * t_slot / 24.0)

            for is_pre in [0, 1]:
                sim_lead_hours = 24.0 if is_pre == 1 else 0.0
                
                lookup_key_pb = (item_str, is_pre)
                pb_avg = prebook_avg_dict.get(lookup_key_pb, item_avg_dict.get(item_str, 1.0))
                    
                weekend_prebook_flag = is_weekend * is_pre
                item_prebook_ratio = item_prebook_ratio_dict.get(item_str, 0.0)
                recent_trend = latest_trend_dict.get(item_str, item_avg_dict.get(item_str, 1.0))
                
                lookup_key_meal = (item_str, is_breakfast, is_lunch, is_evening)
                meal_avg_val = meal_avg_dict.get(lookup_key_meal, item_avg_dict.get(item_str, 1.0))
                
                scenario_dict = {
                    'Item': item_str,
                    'is_prebooking': is_pre,
                    'time_slot': t_slot,
                    'day_of_week': day_of_week,
                    'is_weekend': is_weekend,
                    'weekend_prebook_flag': weekend_prebook_flag,
                    'prebooking_lead_hours': sim_lead_hours,
                    'item_time_avg_qty': hist_avg,
                    'item_prebook_avg_qty': pb_avg,
                    'item_recent_trend': recent_trend,
                    'item_meal_avg_qty': meal_avg_val,
                    'item_base_popularity': item_avg_dict.get(item_str, 1.0),
                    'item_prebook_ratio': item_prebook_ratio,
                    'is_breakfast': is_breakfast,
                    'is_lunch': is_lunch,
                    'is_evening': is_evening,
                    'is_heavy_meal': is_heavy_meal,
                    'is_monday': is_monday,
                    'is_friday': is_friday,
                    'is_sunday': is_sunday,
                    'is_pay_week': is_pay_week,
                    'time_slot_sin': time_sin,
                    'time_slot_cos': time_cos,
                    'day_of_week_sin': day_sin,
                    'day_of_week_cos': day_cos,
                    'month_sin': month_sin,
                    'month_cos': month_cos
                }
                scenario_dict.update(item_one_hot)
                scenarios.append(scenario_dict)
    
    forecast_df = pd.DataFrame(scenarios)
    X_forecast = forecast_df[feature_cols + item_cols]
    
    predictions = model.predict(X_forecast)
    forecast_df['Predicted'] = np.round(predictions).astype(int).clip(min=0)
    
    res = {}
    for item in forecast_df['Item'].unique():
        item_df = forecast_df[forecast_df['Item'] == item]
        hourly = []
        # sum predictions by time_slot
        slot_groups = item_df.groupby('time_slot')['Predicted'].sum().to_dict()
        for t_slot in available_time_slots:
            hourly.append({'time': int(t_slot), 'predicted': int(slot_groups.get(t_slot, 0))})
            
        res[item] = {
            'total': int(item_df['Predicted'].sum()),
            'hourly': hourly
        }
    return res

def main():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        data_path = os.path.join(script_dir, 'data1.csv')
        df = pd.read_csv(data_path)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return

    # To avoid writing stdout to the JSON output by build_and_evaluate_model grid search, 
    # we redirect stdout temporarily so that only our final JSON is printed.
    import io
    old_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        # Dynamically import everything from your high-accuracy xgb.py workflow!
        df, feature_cols, hist_avg_dict, prebook_avg_dict, item_avg_dict, item_prebook_ratio_dict, latest_trend_dict, meal_avg_dict = prepare_data(df)
        X_full, y_full, item_cols, unique_items = extract_features(df, feature_cols)
        rf_model = build_and_evaluate_model(X_full, y_full, feature_cols, item_cols)
        
        # Restrict predictions to hourwise 8am to 6pm (18:00)
        available_time_slots = list(range(8, 19))
    
        # get today's actual
        today_date_str = datetime.now().strftime('%Y-%m-%d')
        yesterday_date_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        
        today_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == today_date_str]
        yesterday_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == yesterday_date_str]
        
        today_actual = today_df.groupby('item')['quantity'].sum().to_dict()
        yesterday_actual = yesterday_df.groupby('item')['quantity'].sum().to_dict()
        today_actual_hourly = today_df.groupby(['item', 'time_slot'])['quantity'].sum().to_dict()
        
        today_target = datetime.now()
        tomorrow_target = today_target + timedelta(days=1)
        
        today_pred = get_forecast(df, rf_model, today_target, item_cols, feature_cols, unique_items, hist_avg_dict, prebook_avg_dict, item_avg_dict, latest_trend_dict, meal_avg_dict, item_prebook_ratio_dict, available_time_slots)
        tomorrow_pred = get_forecast(df, rf_model, tomorrow_target, item_cols, feature_cols, unique_items, hist_avg_dict, prebook_avg_dict, item_avg_dict, latest_trend_dict, meal_avg_dict, item_prebook_ratio_dict, available_time_slots)
        
        # Financials mapping
        price_map = {'dosa': 60, 'pizza': 150, 'sandwich': 50, 'milkshake': 80, 'tea': 20}
        cost_map = {'dosa': 25, 'pizza': 70, 'sandwich': 20, 'milkshake': 40, 'tea': 5}
        
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
        
        # Format the response
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
    finally:
        sys.stdout = old_stdout
    
    # Safely print ONLY the JSON back to Node!
    print(json.dumps(result))

if __name__ == "__main__":
    main()
