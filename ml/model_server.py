import pandas as pd
import numpy as np
from sqlalchemy import create_engine
import os
import json
import threading
import time
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from xgboost import XGBRegressor

# Import functions from get_predictions
from get_predictions import prepare_data, extract_features, build_model, get_forecast

# Global states
global_model = None
global_df = None
global_feature_cols = None
global_lookups = None
last_training_time = 0

def fetch_orders_from_db():
    try:
        user = os.environ.get('PGUSER', 'postgres')
        password = os.environ.get('PGPASSWORD', 'admin')
        host = os.environ.get('PGHOST', 'localhost')
        port = os.environ.get('PGPORT', '5432')
        database = os.environ.get('PGDATABASE', 'bitespeed')
        
        engine = create_engine(f'postgresql://{user}:{password}@{host}:{port}/{database}')
        df = pd.read_sql('SELECT * FROM orders', engine)
        return df
    except Exception as e:
        print(f"[DB Error] {e}")
        return pd.DataFrame()

def load_data_and_model_if_exists():
    global global_model, global_df, global_feature_cols, global_lookups
    print("[SERVER] Connecting to DB to fetch orders...")
    df = fetch_orders_from_db()
    if df.empty:
        print("[SERVER] Error: Could not fetch orders or empty DB.")
        return False

    print("[SERVER] Preparing Data...")
    df, lookups, split_idx, model_end_idx = prepare_data(df)
    
    print("[SERVER] Extracting Features...")
    X, y, feature_cols, encoded_cat_cols = extract_features(df)
    
    global_df = df
    global_feature_cols = feature_cols
    global_lookups = lookups
    
    model_path_xgb = os.path.join(os.path.dirname(__file__), "xgboost_model.json")
    model_path_cb = os.path.join(os.path.dirname(__file__), "catboost_model.cbm")
    if os.path.exists(model_path_xgb) and os.path.exists(model_path_cb):
        print("[SERVER] Found existing model files. Loading...")
        from xgboost import XGBRegressor
        from catboost import CatBoostRegressor
        xgb = XGBRegressor()
        xgb.load_model(model_path_xgb)
        cb = CatBoostRegressor()
        cb.load_model(model_path_cb)
        
        global_model = {"xgb": xgb, "cb": cb}
        return True
        
    return False

def train_and_load_model():
    global global_model, global_df, global_feature_cols, global_lookups, last_training_time
    print("[SERVER] Connecting to DB to fetch orders for training...")
    df = fetch_orders_from_db()
    if df.empty:
        print("[SERVER] Error: Could not fetch orders or empty DB.")
        return

    print("[SERVER] Preparing Data for training...")
    df, lookups, split_idx, model_end_idx = prepare_data(df)
    
    print("[SERVER] Extracting Features for training...")
    X, y, feature_cols, encoded_cat_cols = extract_features(df)
    
    print("[SERVER] Building and Training Model...")
    models = build_model(X, y, feature_cols, split_idx, model_end_idx)
    
    xgb_path = os.path.join(os.path.dirname(__file__), "xgboost_model.json")
    cb_path = os.path.join(os.path.dirname(__file__), "catboost_model.cbm")
    
    models["xgb"].save_model(xgb_path)
    models["cb"].save_model(cb_path)
    
    print(f"[SERVER] Models trained and saved successfully.")
    
    global_model = models
    global_df = df
    global_feature_cols = feature_cols
    global_lookups = lookups
    last_training_time = time.time()
    print(f"[SERVER] Model successfully loaded at {datetime.now().strftime('%H:%M:%S')}. Ready for predictions.")

def background_trainer():
    while True:
        time.sleep(60) # Check every minute
        # Retrain every 2 hours (7200 seconds)
        if time.time() - last_training_time >= 7200:
            print("[SERVER] 2 hours elapsed. Initiating background retraining...")
            train_and_load_model()

class ModelRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        
        if parsed_url.path == '/predict':
            query = parse_qs(parsed_url.query)
            date_str = query.get('date', [None])[0]
            
            if not date_str:
                self.send_error(400, "Missing 'date' parameter (YYYY-MM-DD)")
                return
                
            if global_model is None:
                self.send_error(503, "Model is currently training, please wait")
                return

            try:
                target_date = datetime.strptime(date_str, '%Y-%m-%d')
                today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                is_past_date = target_date < today

                if is_past_date:
                    # For past dates: get real actuals (exclude pre-bookings for other dates)
                    target_df = global_df[global_df['date_obj'].dt.strftime('%Y-%m-%d') == date_str]
                    target_actual = target_df.groupby('item')['quantity'].sum().to_dict()
                    target_actual_hourly = target_df.groupby(['item', 'time_slot'])['quantity'].sum().to_dict()
                else:
                    # For future dates: no actuals — pre-bookings are NOT actuals
                    target_actual = {}
                    target_actual_hourly = {}

                pred_dict = get_forecast(target_date, global_df, global_model, global_feature_cols, global_lookups)
                
                unique_items = global_df['item'].unique()
                demand_list = []
                for item in unique_items:
                    item_pred = pred_dict.get(item, {'total': 0, 'hourly': []})
                    hourly_list = []
                    for h in item_pred.get('hourly', []):
                        hr = h['time']
                        hourly_list.append({
                            'time': hr, 
                            'predicted': h['predicted'], 
                            'actual': int(target_actual_hourly.get((item, hr), 0))
                        })
                    demand_list.append({
                        "item": item.title(),
                        "predicted": item_pred['total'],
                        "actual": int(target_actual.get(item, 0)),
                        "hourly": hourly_list
                    })
                
                result = {
                    "customDate": date_str,
                    "demand": demand_list
                }
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))
                
        elif parsed_url.path == '/predict_today':
            if global_model is None:
                self.send_error(503, "Model is currently training, please wait")
                return

            try:
                df = global_df
                model = global_model
                feature_cols = global_feature_cols
                lookups = global_lookups
                
                today_date_str = datetime.now().strftime('%Y-%m-%d')
                yesterday_date_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

                today_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == today_date_str]
                yesterday_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == yesterday_date_str]

                today_actual = today_df.groupby('item')['quantity'].sum().to_dict()
                yesterday_actual = yesterday_df.groupby('item')['quantity'].sum().to_dict()
                today_actual_hourly = today_df.groupby(['item', 'time_slot'])['quantity'].sum().to_dict()

                today_target = datetime.now()
                tomorrow_target = today_target + timedelta(days=1)

                today_pred = get_forecast(today_target, df, model, feature_cols, lookups)
                tomorrow_pred = get_forecast(tomorrow_target, df, model, feature_cols, lookups)

                unique_items = df['item'].unique()

                price_map = {'dosa': 60, 'pizza': 150, 'sandwich': 50, 'tea': 20, 'burger': 80, 'idly': 40, 'pulao': 100, 'coffee': 25, 'juice': 45, 'icecream': 50, 'samosa': 15, 'panipuri': 30}
                cost_map = {'dosa': 25, 'pizza': 70, 'sandwich': 20, 'tea': 5, 'burger': 40, 'idly': 15, 'pulao': 45, 'coffee': 10, 'juice': 20, 'icecream': 25, 'samosa': 5, 'panipuri': 12}

                total_revenue = 0
                total_cost = 0
                for item_key, qty in today_actual.items():
                    total_revenue += qty * price_map.get(item_key, 0)
                    total_cost += qty * cost_map.get(item_key, 0)
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
                    hourly_list = [{'time': h['time'], 'predicted': h['predicted']} for h in item_pred.get('hourly', [])]
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
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode('utf-8'))
                
            except Exception as e:
                self.send_error(500, str(e))
                
        else:
            self.send_error(404, "Not Found")

    # Disable logging HTTP requests to stdout to keep it clean
    def log_message(self, format, *args):
        pass

def startup_worker():
    loaded = load_data_and_model_if_exists()
    if not loaded:
        print("[SERVER] No existing model found. Training in background...")
        train_and_load_model()

if __name__ == '__main__':
    threading.Thread(target=startup_worker, daemon=True).start()
    threading.Thread(target=background_trainer, daemon=True).start()
    
    server_address = ('', 5001)
    httpd = HTTPServer(server_address, ModelRequestHandler)
    print("[SERVER] HTTP Model Server running on port 5001...")
    httpd.serve_forever()
