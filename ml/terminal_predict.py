import os
import sys
import joblib
from datetime import datetime, timezone, timedelta

# Ensure the working directory is the ml folder
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from model_server import fetch_orders_from_db
from get_predictions import prepare_data, extract_features, get_forecast

def main():
    print("Loading model and database connections...")
    if not os.path.exists('lightgbm_model.joblib'):
        print("Error: Model file 'lightgbm_model.joblib' not found. Train the model first using train_now.py.")
        return
        
    models = joblib.load('lightgbm_model.joblib')
    df = fetch_orders_from_db()
    df, lookups, _, _ = prepare_data(df)
    _, _, feature_cols, _ = extract_features(df)
    
    ist = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist)
    today_str = now.strftime('%Y-%m-%d')
    tomorrow_date = now + timedelta(days=1)
    tomorrow_str = tomorrow_date.strftime('%Y-%m-%d')
    
    print(f"\n=============================================")
    print(f"   AI DEMAND FORECAST: TODAY ({today_str})   ")
    print(f"=============================================")
    today_pred = get_forecast(now, df, models, feature_cols, lookups)
    
    if not today_pred:
        print("No predictions available.")
    else:
        # Sort by highest predicted demand
        sorted_today = sorted(today_pred.items(), key=lambda x: x[1]['total'], reverse=True)
        print(f"{'ITEM NAME':<20} | {'PREDICTED QUANTITY':<15}")
        print("-" * 40)
        for item_name, data in sorted_today:
            print(f"{item_name.title():<20} | {data['total']:<15.1f}")
            
    print(f"\n=============================================")
    print(f" AI DEMAND FORECAST: TOMORROW ({tomorrow_str}) ")
    print(f"=============================================")
    tomorrow_pred = get_forecast(tomorrow_date, df, models, feature_cols, lookups)
    
    if not tomorrow_pred:
        print("No predictions available.")
    else:
        sorted_tomorrow = sorted(tomorrow_pred.items(), key=lambda x: x[1]['total'], reverse=True)
        print(f"{'ITEM NAME':<20} | {'PREDICTED QUANTITY':<15}")
        print("-" * 40)
        for item_name, data in sorted_tomorrow:
            print(f"{item_name.title():<20} | {data['total']:<15.1f}")
            
    if len(sys.argv) > 1:
        custom_date_str = sys.argv[1]
        try:
            custom_date = datetime.strptime(custom_date_str, '%d-%m-%Y')
            print(f"\n=============================================")
            print(f" AI DEMAND FORECAST: CUSTOM ({custom_date_str}) ")
            print(f"=============================================")
            print("Calculating AI forecast... Please wait...", flush=True)
            custom_pred = get_forecast(custom_date, df, models, feature_cols, lookups)
            if not custom_pred:
                print("No predictions available.")
            else:
                sorted_custom = sorted(custom_pred.items(), key=lambda x: x[1]['total'], reverse=True)
                print(f"{'ITEM NAME':<20} | {'PREDICTED QUANTITY':<15}")
                print("-" * 40)
                for item_name, data in sorted_custom:
                    print(f"{item_name.title():<20} | {data['total']:<15.1f}")
        except ValueError:
            print(f"\n[ERROR] Invalid date '{custom_date_str}'. Please run the script like this:")
            print("python terminal_predict.py 15-06-2026")
    else:
        print("\nTip: To check a specific date, open a new Terminal and run this command:")
        print("python terminal_predict.py 15-06-2026")
        
    print("\nFinished!")

if __name__ == "__main__":
    main()
