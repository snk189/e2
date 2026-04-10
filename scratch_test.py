import pandas as pd
from sklearn.model_selection import GridSearchCV
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
import numpy as np
import warnings

warnings.filterwarnings('ignore')

try:
    from xgboost import XGBRegressor
except ImportError:
    XGBRegressor = None
    
try:
    from lightgbm import LGBMRegressor
except ImportError:
    LGBMRegressor = None

def main():
    file_path = 'data.csv'
    try:
        df = pd.read_csv(file_path)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found.")
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
    
    # 8. Historical Average by Prebooking
    prebook_avg = df.groupby(['item', 'is_prebooking'])['quantity'].mean().reset_index()
    prebook_avg = prebook_avg.rename(columns={'quantity': 'item_prebook_avg_qty'})
    df = df.merge(prebook_avg, on=['item', 'is_prebooking'], how='left')
    
    df['item_prebook_avg_qty'] = df.apply(
        lambda row: item_overall_avg[row['item']] if pd.isna(row['item_prebook_avg_qty']) else row['item_prebook_avg_qty'], 
        axis=1
    )
    
    # 9. Recent Momentum (EWMA)
    df['item_recent_trend'] = df.groupby('item')['quantity'].transform(lambda x: x.shift(1).ewm(span=50, min_periods=1).mean())
    df['item_recent_trend'] = df.apply(
        lambda row: item_overall_avg[row['item']] if pd.isna(row['item_recent_trend']) else row['item_recent_trend'], 
        axis=1
    )

    # 10. Broad Meal-Time Averages
    meal_avg = df.groupby(['item', 'is_breakfast', 'is_lunch', 'is_evening'])['quantity'].mean().reset_index()
    meal_avg = meal_avg.rename(columns={'quantity': 'item_meal_avg_qty'})
    df = df.merge(meal_avg, on=['item', 'is_breakfast', 'is_lunch', 'is_evening'], how='left')
    df['item_meal_avg_qty'] = df['item_meal_avg_qty'].fillna(df['item'].map(item_overall_avg))

    feature_cols = [
        'time_slot', 'day_of_week', 'is_prebooking', 'is_weekend', 'prebooking_lead_hours',
        'weekend_prebook_flag', 'item_time_avg_qty', 'item_prebook_avg_qty',
        'item_recent_trend', 'item_meal_avg_qty', 'item_base_popularity',
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
    
    item_dummies = pd.get_dummies(X['item'], prefix='item', dtype=int)
    X = pd.concat([X, item_dummies], axis=1)
    X = X.drop('item', axis=1)
    item_cols = list(item_dummies.columns)
    
    X_full = X[item_cols + feature_cols]
    y_full = y
    
    # Chronological time-series split
    split_idx = int(len(X_full) * 0.8)
    X_train, X_test = X_full.iloc[:split_idx], X_full.iloc[split_idx:]
    y_train, y_test = y_full.iloc[:split_idx], y_full.iloc[split_idx:]
    
    models_to_test = {
        'GradientBoostingRegressor': GradientBoostingRegressor(random_state=42),
        'HistGradientBoostingRegressor': HistGradientBoostingRegressor(random_state=42),
    }

    if LGBMRegressor is not None:
        models_to_test['LGBMRegressor'] = LGBMRegressor(random_state=42, n_jobs=-1, verbose=-1)
    if XGBRegressor is not None:
        models_to_test['XGBRegressor'] = XGBRegressor(random_state=42, n_jobs=-1)

    print("\n[⏳] Running GridSearchCV to auto-tune hyper-parameters (this may take a few seconds)...")
    param_grid = {
        'n_estimators': [100, 300],
        'max_depth': [3, 5, 7],
        'learning_rate': [0.05, 0.1]
    }
    
    # For HistGradientBoostingRegressor, param grid is different. It uses max_iter instead of n_estimators
    hist_param_grid = {
        'max_iter': [100, 300],
        'learning_rate': [0.05, 0.1]
    }

    for name, base_model in models_to_test.items():
        print(f"\n============= 🚀 Testing {name} =============")
        current_grid = hist_param_grid if name == 'HistGradientBoostingRegressor' else param_grid
        
        grid_search = GridSearchCV(estimator=base_model, param_grid=current_grid, cv=3, n_jobs=-1, scoring='neg_mean_absolute_error')
        grid_search.fit(X_train, y_train)
        
        print(f"[✔] Tuning Complete! Best Parameters: {grid_search.best_params_}")
        
        eval_model = grid_search.best_estimator_
        y_pred = eval_model.predict(X_test)
        
        r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        mse = mean_squared_error(y_test, y_pred)
        exact_acc = np.mean(np.round(y_pred) == y_test) * 100
        
        print(f"R² Score: {r2:.4f}")
        print(f"Mean Absolute Error (MAE): {mae:.4f}")
        print(f"Mean Squared Error (MSE): {mse:.4f}")
        print(f"Exact Integer Match Accuracy: {exact_acc:.2f}%")

if __name__ == "__main__":
    main()
