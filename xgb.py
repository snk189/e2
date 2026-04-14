import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import GridSearchCV
from xgboost import XGBRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from datetime import datetime
import warnings
import numpy as np

warnings.filterwarnings('ignore')

def main():
    file_path = 'data.csv'
    try:
        df = pd.read_csv(file_path)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        return
        
    # Sort chronologically to prevent future-data leakage
    df = df.sort_values('timestamp').reset_index(drop=True)
    
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    df['weekend_prebook_flag'] = df['is_weekend'] * df['is_prebooking']
    
    # 1. Meal Time Categories
    df['is_breakfast'] = df['time_slot'].apply(lambda x: 1 if 8 <= x <= 10 else 0)
    df['is_lunch'] = df['time_slot'].apply(lambda x: 1 if 11 <= x <= 14 else 0)
    df['is_evening'] = df['time_slot'].apply(lambda x: 1 if 15 <= x <= 18 else 0)
    
    # 2. Item Categories
    df['is_beverage'] = df['item'].isin(['tea', 'milkshake']).astype(int)
    df['is_heavy_meal'] = df['item'].isin(['pizza', 'dosa']).astype(int)
    
    # 3. Start/End of Week
    df['is_monday'] = (df['day_of_week'] == 0).astype(int)
    df['is_friday'] = (df['day_of_week'] == 4).astype(int)
    df['is_sunday'] = (df['day_of_week'] == 6).astype(int)
    
    # 4. Time of Month (Pay Week)
    df['date_obj'] = pd.to_datetime(df['timestamp'], unit='s')
    df['day_of_month'] = df['date_obj'].dt.day
    df['is_pay_week'] = df['day_of_month'].apply(lambda x: 1 if x >= 25 or x <= 5 else 0)
    
    # 4.5. Prebooking Lead Time
    df['prebooking_datetime_str'] = df['prebooking_date'] + ' ' + df['prebooking_time']
    df['prebooking_obj'] = pd.to_datetime(df['prebooking_datetime_str'], format='%Y-%m-%d %H:%M:%S', errors='coerce')
    df['prebooking_lead_hours'] = (df['date_obj'] - df['prebooking_obj']).dt.total_seconds() / 3600.0
    df['prebooking_lead_hours'] = df['prebooking_lead_hours'].fillna(0).clip(lower=0)

    
    # 5. Seasonality (Month of Year)
    df['month'] = df['date_obj'].dt.month
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12.0)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12.0)
    
    # 6. Cyclical Time Encoding
    df['time_slot_sin'] = np.sin(2 * np.pi * df['time_slot'] / 24.0)
    df['time_slot_cos'] = np.cos(2 * np.pi * df['time_slot'] / 24.0)
    df['day_of_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7.0)
    df['day_of_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7.0)
    
    # 7. Historical Average Demand
    historical_avg = df.groupby(['item', 'day_of_week', 'time_slot'])['quantity'].mean().reset_index()
    historical_avg = historical_avg.rename(columns={'quantity': 'item_time_avg_qty'})
    df = df.merge(historical_avg, on=['item', 'day_of_week', 'time_slot'], how='left')
    
    item_overall_avg = df.groupby('item')['quantity'].mean()
    df['item_base_popularity'] = df['item'].map(item_overall_avg)
    
    df['item_time_avg_qty'] = df.apply(
        lambda row: item_overall_avg[row['item']] if pd.isna(row['item_time_avg_qty']) else row['item_time_avg_qty'], 
        axis=1
    )
    
    hist_avg_dict = historical_avg.set_index(['item', 'day_of_week', 'time_slot'])['item_time_avg_qty'].to_dict()
    item_avg_dict = item_overall_avg.to_dict()
    
    # 8. Historical Average by Prebooking
    prebook_avg = df.groupby(['item', 'is_prebooking'])['quantity'].mean().reset_index()
    prebook_avg = prebook_avg.rename(columns={'quantity': 'item_prebook_avg_qty'})
    df = df.merge(prebook_avg, on=['item', 'is_prebooking'], how='left')
    
    df['item_prebook_avg_qty'] = df.apply(
        lambda row: item_overall_avg[row['item']] if pd.isna(row['item_prebook_avg_qty']) else row['item_prebook_avg_qty'], 
        axis=1
    )
    
    prebook_avg_dict = prebook_avg.set_index(['item', 'is_prebooking'])['item_prebook_avg_qty'].to_dict()
    
    # 8.5 Item Prebooking Ratio
    item_total_qty = df.groupby('item')['quantity'].sum()
    item_prebook_qty = df[df['is_prebooking'] == 1].groupby('item')['quantity'].sum()
    item_prebook_ratio_series = (item_prebook_qty / item_total_qty).fillna(0)
    df['item_prebook_ratio'] = df['item'].map(item_prebook_ratio_series)
    item_prebook_ratio_dict = item_prebook_ratio_series.to_dict()

    # 9. Recent Momentum (EWMA)
    df['item_recent_trend'] = df.groupby('item')['quantity'].transform(lambda x: x.shift(1).ewm(span=50, min_periods=1).mean())
    df['item_recent_trend'] = df.apply(
        lambda row: item_overall_avg[row['item']] if pd.isna(row['item_recent_trend']) else row['item_recent_trend'], 
        axis=1
    )
    latest_trend_dict = df.groupby('item').last()['item_recent_trend'].to_dict()

    # 10. Broad Meal-Time Averages
    meal_avg = df.groupby(['item', 'is_breakfast', 'is_lunch', 'is_evening'])['quantity'].mean().reset_index()
    meal_avg = meal_avg.rename(columns={'quantity': 'item_meal_avg_qty'})
    df = df.merge(meal_avg, on=['item', 'is_breakfast', 'is_lunch', 'is_evening'], how='left')
    df['item_meal_avg_qty'] = df['item_meal_avg_qty'].fillna(df['item'].map(item_overall_avg))
    meal_avg_dict = meal_avg.set_index(['item', 'is_breakfast', 'is_lunch', 'is_evening'])['item_meal_avg_qty'].to_dict()

    feature_cols = [
        'time_slot', 'day_of_week', 'is_prebooking', 'is_weekend', 'prebooking_lead_hours',
        'weekend_prebook_flag', 'item_time_avg_qty', 'item_prebook_avg_qty',
        'item_recent_trend', 'item_meal_avg_qty', 'item_base_popularity',
        'item_prebook_ratio',
        'is_breakfast', 'is_lunch', 'is_evening',
        'is_beverage', 'is_heavy_meal',
        'is_monday', 'is_friday', 'is_sunday', 'is_pay_week',
        'time_slot_sin', 'time_slot_cos',
        'day_of_week_sin', 'day_of_week_cos',
        'month_sin', 'month_cos'
    ]
    
    features = ['item'] + feature_cols
    target = 'quantity'
    
    X = df[features].copy()
    y = df[target]
    
    unique_items = sorted(X['item'].unique())
    item_dummies = pd.get_dummies(X['item'], prefix='item', dtype=int)
    X = pd.concat([X, item_dummies], axis=1)
    X = X.drop('item', axis=1)
    item_cols = list(item_dummies.columns)
    
    available_time_slots = sorted(df['time_slot'].unique())

    X_full = X[item_cols + feature_cols]
    y_full = y
    
    # Chronological time-series split
    split_idx = int(len(X_full) * 0.8)
    X_train, X_test = X_full.iloc[:split_idx], X_full.iloc[split_idx:]
    y_train, y_test = y_full.iloc[:split_idx], y_full.iloc[split_idx:]
    
    print("\n[⏳] Running GridSearchCV to auto-tune hyper-parameters (this may take a few seconds)...")
    param_grid = {
        'n_estimators': [100, 300],
        'max_depth': [3, 5, 7],
        'learning_rate': [0.05, 0.1]
    }
    xgb_base = XGBRegressor(random_state=42, n_jobs=-1)
    grid_search = GridSearchCV(estimator=xgb_base, param_grid=param_grid, cv=3, n_jobs=-1, scoring='neg_mean_absolute_error')
    grid_search.fit(X_train, y_train)
    
    print(f"[✔] Tuning Complete! Best Model Parameters: {grid_search.best_params_}")
    
    rf_eval_model = grid_search.best_estimator_
    y_pred = rf_eval_model.predict(X_test)
    
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    exact_acc = np.mean(np.round(y_pred) == y_test) * 100
    
    print(f"\n============= 📊 Model Evaluation on Test Data =============")
    print(f"R² Score: {r2:.4f}")
    print(f"Mean Absolute Error (MAE): {mae:.4f}")
    print(f"Mean Squared Error (MSE): {mse:.4f}")
    print(f"Exact Integer Match Accuracy: {exact_acc:.2f}%\n")
    
    print(f"============= ⭐ Top 5 Important Features =============")
    importances = rf_eval_model.feature_importances_
    all_features = item_cols + feature_cols
    feature_importance_df = pd.DataFrame({
        'Feature': all_features,
        'Importance': importances
    }).sort_values(by='Importance', ascending=False).head(5)
    
    for idx, row in feature_importance_df.iterrows():
        print(f" - {row['Feature']}: {row['Importance']:.4f}")
    print("=====================================================\n")
    
    rf_model = XGBRegressor(**grid_search.best_params_, random_state=42, n_jobs=-1)
    rf_model.fit(X_full, y_full)
    
    print("[✔] Final Model Trained Successfully on Full Dataset.")
    
    while True:
        date_input = input("\nEnter a date (YYYY-MM-DD) to forecast demand (or type 'q' to quit): ").strip()
        if date_input.lower() == 'q':
            break
            
        try:
            target_date = datetime.strptime(date_input, '%Y-%m-%d')
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
            
            print(f"\n============= 📅 Demand Forecast for {target_date.strftime('%B %d, %Y')} =============")
            
            scenarios = []
            for item_str in unique_items:
                is_beverage = int(item_str in ['tea', 'milkshake'])
                is_heavy_meal = int(item_str in ['pizza', 'dosa'])
                
                item_one_hot = {col: 0 for col in item_cols}
                if f'item_{item_str}' in item_cols:
                    item_one_hot[f'item_{item_str}'] = 1
                
                for t_slot in available_time_slots:
                    lookup_key = (item_str, day_of_week, t_slot)
                    hist_avg = hist_avg_dict.get(lookup_key)
                    if hist_avg is None:
                        hist_avg = item_avg_dict.get(item_str, 1.0)
                        
                    is_breakfast = int(8 <= t_slot <= 10)
                    is_lunch = int(11 <= t_slot <= 14)
                    is_evening = int(15 <= t_slot <= 18)
                    
                    time_sin = np.sin(2 * np.pi * t_slot / 24.0)
                    time_cos = np.cos(2 * np.pi * t_slot / 24.0)

                    for is_pre in [0, 1]:
                        # Default simulation: 24h lead time for prebooking, 0h for walk-ins
                        sim_lead_hours = 24.0 if is_pre == 1 else 0.0
                        
                        lookup_key_pb = (item_str, is_pre)
                        pb_avg = prebook_avg_dict.get(lookup_key_pb)
                        if pb_avg is None:
                            pb_avg = item_avg_dict.get(item_str, 1.0)
                            
                        weekend_prebook_flag = is_weekend * is_pre
                        
                        item_prebook_ratio = item_prebook_ratio_dict.get(item_str, 0.0)
                        
                        recent_trend = latest_trend_dict.get(item_str, item_avg_dict.get(item_str, 1.0))
                        
                        lookup_key_meal = (item_str, is_breakfast, is_lunch, is_evening)
                        meal_avg_val = meal_avg_dict.get(lookup_key_meal, item_avg_dict.get(item_str, 1.0))
                        
                        scenario_dict = {
                            'Item': item_str.title(),
                            'Time Slot': f"{t_slot:02d}:00",
                            'Order Type': 'Prebooking' if is_pre == 1 else 'Walk-in',
                            'time_slot': t_slot,
                            'day_of_week': day_of_week,
                            'is_prebooking': is_pre,
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
                            'is_beverage': is_beverage,
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
            X_forecast = forecast_df[item_cols + feature_cols]
            
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