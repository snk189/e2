import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestRegressor
from datetime import datetime
import warnings
import numpy as np

warnings.filterwarnings('ignore')

def main():
    file_path = 'data.csv'
    try:
        df = pd.read_csv(file_path)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
        return
    
    features = ['item', 'time_slot', 'day_of_week', 'is_prebooking']
    target = 'quantity'
    
    X = df[features].copy()
    y = df[target]
    
    label_encoder = LabelEncoder()
    unique_items = sorted(X['item'].unique())
    X['item_encoded'] = label_encoder.fit_transform(X['item'])
    X = X.drop('item', axis=1)
    
    available_time_slots = sorted(df['time_slot'].unique())

    X_train = X[['item_encoded', 'time_slot', 'day_of_week', 'is_prebooking']]
    rf_model = RandomForestRegressor(n_estimators=100, random_state=42)
    rf_model.fit(X_train, y)
    
    print("\n[✔] Model Trained Successfully.")
    
    while True:
        date_input = input("\nEnter a date (YYYY-MM-DD) to forecast demand (or type 'q' to quit): ").strip()
        if date_input.lower() == 'q':
            break
            
        try:
            target_date = datetime.strptime(date_input, '%Y-%m-%d')
            day_of_week = target_date.weekday()
            print(f"\n============= 📅 Demand Forecast for {target_date.strftime('%B %d, %Y')} =============")
            
            scenarios = []
            for item_str in unique_items:
                item_code = label_encoder.transform([item_str])[0]
                for t_slot in available_time_slots:
                    for is_pre in [0, 1]:
                        scenarios.append({
                            'Item': item_str.title(),
                            'Time Slot': f"{t_slot:02d}:00",
                            'Order Type': 'Prebooking' if is_pre == 1 else 'Walk-in',
                            'time_slot': t_slot,
                            'item_encoded': item_code,
                            'day_of_week': day_of_week,
                            'is_prebooking': is_pre
                        })
            
            forecast_df = pd.DataFrame(scenarios)
            X_forecast = forecast_df[['item_encoded', 'time_slot', 'day_of_week', 'is_prebooking']]
            
            predictions = rf_model.predict(X_forecast)
            
            forecast_df['Predicted Demand'] = np.round(predictions).astype(int)
            
            pivot_df = forecast_df.pivot_table(
                index=['Item', 'Time Slot'], 
                columns='Order Type', 
                values='Predicted Demand',
                aggfunc='sum'
            )
            
            pivot_df.columns.name = None
            
            pivot_df['Total Demand'] = pivot_df['Walk-in'] + pivot_df['Prebooking']
            
            pivot_df = pivot_df.fillna(0).astype(int)
            
            pivot_df = pivot_df[pivot_df['Total Demand'] > 0]
            
            if pivot_df.empty:
                print("No active demand times predicted for this date.")
            else:
                pd.set_option('display.max_rows', None)
                print(pivot_df.to_string())
                pd.reset_option('display.max_rows')
                
            print("========================================================================\n")

        except ValueError:
            print("Invalid date format. Please use YYYY-MM-DD (e.g. 2026-04-10).")

if __name__ == "__main__":
    main()