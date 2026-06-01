import pandas as pd
from sqlalchemy import create_engine
import os
import sys

# Add ml folder to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'ml'))

from get_predictions import prepare_data, extract_features, build_model, get_forecast
from datetime import datetime, timedelta

def main():
    user = os.environ.get('PGUSER', 'postgres')
    password = os.environ.get('PGPASSWORD', 'admin')
    host = os.environ.get('PGHOST', 'localhost')
    port = os.environ.get('PGPORT', '5432')
    database = os.environ.get('PGDATABASE', 'bitespeed')
    
    engine = create_engine(f'postgresql://{user}:{password}@{host}:{port}/{database}')
    df = pd.read_sql('SELECT * FROM orders', engine)
    
    print("Fetched", len(df), "orders")
    
    # 1. Prepare data
    df_prepared, lookups, split_idx, model_end_idx = prepare_data(df)
    
    # 2. Extract features
    X, y, feature_cols, encoded_cat_cols = extract_features(df_prepared)
    
    # 3. Build model (we don't need to rebuild if it's already there, but let's do a fast retrain to ensure we have the exact same model)
    print("Building model...")
    models = build_model(X, y, feature_cols, split_idx, model_end_idx)
    
    # Pick a date to test on, let's say the last date in the dataset
    last_date = pd.to_datetime('29-05-2026', format='%d-%m-%Y')
    target_date = last_date
    date_str = target_date.strftime('%Y-%m-%d')
    
    # Get actuals for that date
    target_df = df_prepared[df_prepared['date_obj'].dt.strftime('%Y-%m-%d') == date_str]
    target_actual = target_df.groupby('item')['quantity'].sum().to_dict()
    
    # Generate predictions
    pred_dict = get_forecast(target_date, df_prepared, models, feature_cols, lookups)
    
    # Compare
    print(f"\n--- Comparison for {date_str} ---")
    print(f"{'Item':<15} | {'Actual':<10} | {'Predicted':<10} | {'Difference':<10}")
    print("-" * 55)
    
    unique_items = df_prepared['item'].unique()
    for item in unique_items:
        actual = target_actual.get(item, 0)
        predicted = pred_dict.get(item, {}).get('total', 0)
        diff = predicted - actual
        if abs(diff) >= 0:
            print(f"{item:<15} | {actual:<10} | {predicted:<10} | {diff:<10}")

if __name__ == '__main__':
    main()
