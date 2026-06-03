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

# Import functions from get_predictions
from get_predictions import prepare_data, extract_features, build_model, get_forecast

# Global states
global_model = None
global_df = None
global_feature_cols = None
global_lookups = None
last_training_time = 0
is_training = False

def fetch_orders_from_db():
    try:
        user = os.environ.get('PGUSER', 'postgres')
        password = os.environ.get('PGPASSWORD', 'admin')
        host = os.environ.get('PGHOST', 'localhost')
        port = os.environ.get('PGPORT', '5432')
        database = os.environ.get('PGDATABASE', 'bitespeed')
        
        engine = create_engine(f'postgresql://{user}:{password}@{host}:{port}/{database}')
        df = pd.read_sql('SELECT * FROM orders WHERE quantity > 0', engine)
        return df
    except Exception as e:
        print(f"[SERVER] Error fetching from DB: {e}")
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
    
    model_path = os.path.join(os.path.dirname(__file__), "lightgbm_model.joblib")
    if os.path.exists(model_path):
        print("[SERVER] Found existing model file. Loading...")
        import joblib
        model = joblib.load(model_path)
        
        global_model = model
        return True
        
    return False

def train_and_load_model():
    global global_model, global_df, global_feature_cols, global_lookups, last_training_time, is_training
    if is_training:
        print("[SERVER] Training already in progress, skipping...")
        return
        
    is_training = 'model'
    try:
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
        model = build_model(X, y, feature_cols, split_idx, model_end_idx)
        
        model_path = os.path.join(os.path.dirname(__file__), "lightgbm_model.joblib")
        import joblib
        joblib.dump(model, model_path)
        
        print("[SERVER] Model successfully saved via joblib.")
        
        # Save model training metadata and generate VS Code report
        try:
            from datetime import datetime, timezone, timedelta
            ist = timezone(timedelta(hours=5, minutes=30))
            last_trained = datetime.now(ist).strftime("%Y-%m-%d %H:%M:%S")
            
            model_info = {"last_trained_ist": last_trained}
            with open('model_info.json', 'w') as f:
                json.dump(model_info, f)
                
            # Build the VS Code output file
            report = f"Model Training Status\nLast Retrain Finished: {last_trained}\n\n"
            report += "LightGBM + Optuna Parameters\n"
            
            if os.path.exists('optuna_params.json'):
                with open('optuna_params.json', 'r') as f:
                    op = json.load(f)
                params = op.get('params', {})
                report += f"N-Estimators\n{params.get('n_estimators', 'N/A')}\n\n"
                report += f"Max Depth\n{params.get('max_depth', 'N/A')}\n\n"
                report += f"Learning Rate\n{params.get('learning_rate', 'N/A')}\n\n"
                report += f"Num Leaves\n{params.get('num_leaves', 'N/A')}\n\n"
                report += f"Last tuned: {op.get('last_run_ist', 'N/A')}\n"
            else:
                report += "No Optuna Tuning Data Available.\n"
                
            with open('vscode_model_status.txt', 'w') as f:
                f.write(report)
        except Exception as e:
            print("[SERVER] Failed to save model info/report:", e)
        
        # Reload model into globals
        global_model = model
        global_df = df
        global_feature_cols = feature_cols
        global_lookups = lookups
        last_training_time = time.time()
        print(f"[SERVER] Model successfully loaded at {datetime.now().strftime('%H:%M:%S')}. Ready for predictions.")
    except Exception as e:
        print(f"[SERVER] Error during training: {e}")
    finally:
        is_training = False

def get_ml_settings():
    try:
        settings_path = os.path.join(os.path.dirname(__file__), 'ml_settings.json')
        with open(settings_path, 'r') as f:
            return json.load(f)
    except Exception:
        return {"auto_train": False, "auto_optuna": False}

def background_trainer():
    global last_training_time
    while True:
        time.sleep(60) # Check every minute
        settings = get_ml_settings()
        if not settings.get('auto_train', False):
            continue
            
        # Retrain every 2 hours (7200 seconds)
        if time.time() - last_training_time >= 7200:
            print("[SERVER] 2 hours elapsed. Initiating background retraining (auto_train is ON)...")
            train_and_load_model()

class ModelRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlparse(self.path)
        
        if parsed_url.path == '/status':
            progress_file = os.path.join(os.path.dirname(__file__), "training_progress.json")
            progress = 0
            if is_training:
                try:
                    if os.path.exists(progress_file):
                        with open(progress_file, "r") as f:
                            data = json.load(f)
                            progress = data.get("progress", 0)
                except Exception:
                    pass
                    
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'is_training': is_training, 'progress': progress}).encode('utf-8'))
            return
        elif parsed_url.path == '/trigger_optuna':
            threading.Thread(target=run_optuna_background).start()
            res_data = {'status': 'Optuna tuning started in background'}
            
        elif parsed_url.path == '/stats':
            stats = {}
            if os.path.exists('optuna_params.json'):
                try:
                    with open('optuna_params.json', 'r') as f:
                        stats['optuna'] = json.load(f)
                except Exception:
                    pass
            if os.path.exists('model_info.json'):
                try:
                    with open('model_info.json', 'r') as f:
                        stats['model_info'] = json.load(f)
                except Exception:
                    pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(stats).encode('utf-8'))
            return
            
        elif parsed_url.path == '/retrain':
            if is_training:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'message': 'Training already in progress'}).encode('utf-8'))
                return
                
            # Spawn background thread to retrain
            threading.Thread(target=train_and_load_model).start()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'message': 'Retraining started'}).encode('utf-8'))
            return
            
        if parsed_url.path == '/predict':
            query = parse_qs(parsed_url.query)
            date_str = query.get('date', [None])[0]
            
            if not date_str:
                self.send_error(400, "Missing 'date' parameter (YYYY-MM-DD)")
                return
                
            if global_model is None:
                self.send_error(503, "Models are currently training, please wait")
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

                pred_dict = get_forecast(target_date, global_df, (global_model), global_feature_cols, global_lookups)
                
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
                self.send_error(503, "Models are currently training, please wait")
                return

            try:
                df = global_df
                models = (global_model)
                feature_cols = global_feature_cols
                lookups = global_lookups
                
                today_date_str = datetime.now().strftime('%Y-%m-%d')
                yesterday_date_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

                today_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == today_date_str]
                yesterday_df = df[df['date_obj'].dt.strftime('%Y-%m-%d') == yesterday_date_str]

                today_actual = today_df.groupby('item')['quantity'].sum().to_dict()
                yesterday_actual = yesterday_df.groupby('item')['quantity'].sum().to_dict()
                today_actual_hourly = today_df.groupby(['item', 'time_slot'])['quantity'].sum().to_dict()

                try:
                    import requests
                    live_orders = requests.get('http://localhost:5000/api/admin/today_orders', timeout=2).json()
                    if isinstance(live_orders, list):
                        today_actual = {}
                        today_actual_hourly = {}
                        for o in live_orders:
                            key = o.get('item', '').lower()
                            qty = o.get('quantity', 0)
                            today_actual[key] = today_actual.get(key, 0) + qty
                            eff_time = o.get('effective_time') or o.get('order_timestamp')
                            if eff_time:
                                hr = datetime.fromtimestamp(eff_time).hour
                                if hr < 8: hr = 8
                                if hr > 18: hr = 18
                                today_actual_hourly[(key, hr)] = today_actual_hourly.get((key, hr), 0) + qty
                except Exception:
                    pass


                today_target = datetime.now()
                tomorrow_target = today_target + timedelta(days=1)

                today_pred = get_forecast(today_target, df, models, feature_cols, lookups)
                tomorrow_pred = get_forecast(tomorrow_target, df, models, feature_cols, lookups)

                unique_items = df['item'].unique()

                price_map = {'dosa': 60, 'pizza': 150, 'sandwich': 50, 'milkshake': 80, 'tea': 20, 'burger': 80, 'idly': 40, 'pulao': 100, 'coffee': 25, 'juice': 45, 'icecream': 50, 'samosa': 15, 'panipuri': 30}
                cost_map = {'dosa': 25, 'pizza': 70, 'sandwich': 20, 'milkshake': 40, 'tea': 5, 'burger': 40, 'idly': 15, 'pulao': 50, 'coffee': 10, 'juice': 20, 'icecream': 25, 'samosa': 5, 'panipuri': 10}

                total_revenue = 0
                total_cost = 0
                for item_key, qty in today_actual.items():
                    total_revenue += qty * price_map.get(item_key.lower(), 0)
                    total_cost += qty * cost_map.get(item_key.lower(), 0)
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
                    selling_price = price_map.get(item.lower(), 0)
                    cost_price = cost_map.get(item.lower(), 0)
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
    settings = get_ml_settings()
    
    if not loaded:
        print("[SERVER] Model not found on disk. Forcing an initial train to boot up...")
        if settings.get('auto_optuna', False):
            print("[SERVER] auto_optuna is ON. Running Optuna before initial train...")
            run_optuna_background()
        train_and_load_model()
        return

    optuna_needs_run = False
    if settings.get('auto_optuna', False):
        if os.path.exists('optuna_params.json'):
            try:
                from datetime import datetime, timezone, timedelta
                with open('optuna_params.json', 'r') as f:
                    optuna_data = json.load(f)
                last_run_str = optuna_data.get('last_run_ist', '')
                if last_run_str:
                    ist = timezone(timedelta(hours=5, minutes=30))
                    last_run_time = datetime.strptime(last_run_str, "%Y-%m-%d %H:%M:%S")
                    last_run_time = last_run_time.replace(tzinfo=ist)
                    now_ist = datetime.now(ist)
                    if (now_ist - last_run_time).days >= 7:
                        optuna_needs_run = True
                else:
                    optuna_needs_run = True
            except Exception as e:
                print("[SERVER] Error checking optuna age:", e)
                optuna_needs_run = True
        else:
            optuna_needs_run = True

    if optuna_needs_run:
        print("[SERVER] Optuna tuning is >1 week old or missing. Running Optuna (auto_optuna is ON)...")
        run_optuna_background()
        if settings.get('auto_train', False):
            print("[SERVER] Optuna finished. Training model (auto_train is ON)...")
            train_and_load_model()
    else:
        if settings.get('auto_optuna', False):
            print("[SERVER] Optuna params are recent (<1 week). Skipping Optuna.")
        
        if settings.get('auto_train', False):
            print("[SERVER] Triggering startup model retrain (auto_train is ON)...")
            train_and_load_model()
        else:
            print("[SERVER] Startup auto_train and auto_optuna logic skipped (disabled in ml_settings.json).")

def run_optuna_background():
    global global_df, global_feature_cols, global_lookups, is_training
    if is_training:
        print("[SERVER] Process already in progress, skipping optuna...")
        return
        
    try:
        is_training = 'optuna'
        print("[SERVER] Starting background Optuna tuning...")
        from get_predictions import prepare_data, extract_features, run_optuna_tuning
        df = fetch_orders_from_db()
        df, lookups, split_idx, model_end_idx = prepare_data(df)
        X, y, feature_cols, encoded_cat_cols = extract_features(df)
        run_optuna_tuning(X, y, split_idx, model_end_idx)
        print("[SERVER] Background Optuna tuning finished.")
    except Exception as e:
        print(f"[SERVER] Background Optuna tuning failed: {e}")
    finally:
        is_training = False

if __name__ == '__main__':
    threading.Thread(target=startup_worker, daemon=True).start()
    threading.Thread(target=background_trainer, daemon=True).start()
    
    server_address = ('', 5001)
    httpd = HTTPServer(server_address, ModelRequestHandler)
    print("[SERVER] HTTP Model Server running on port 5001...")
    httpd.serve_forever()



