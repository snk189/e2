import sys, os, joblib, json
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# Ensure ml module is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from model_server import fetch_orders_from_db
from get_predictions import prepare_data, extract_features

def main():
    print("Fetching data from DB...")
    df = fetch_orders_from_db()
    
    print("Preparing data and extracting features...")
    df, lookups, split_idx, model_end_idx = prepare_data(df)
    X, y, feature_cols, encoded_cat_cols = extract_features(df)
    
    # We will test on data after split_idx
    X_test = X.iloc[split_idx:model_end_idx]
    y_test = y.iloc[split_idx:model_end_idx]
    
    if len(X_test) == 0:
        print("No testing data available based on current split.")
        return
        
    print(f"Testing on {len(X_test)} records...")
    
    model_path = os.path.join(os.path.dirname(__file__), 'lightgbm_model.joblib')
    if not os.path.exists(model_path):
        print(f"Model file not found at {model_path}. Please train the model first.")
        return
        
    model_dict = joblib.load(model_path)
    
    if isinstance(model_dict, dict) and 'model_1' in model_dict:
        # Dual models
        group1_items = model_dict.get('group1_items', [])
        g1_cols = [f'item_{it}' for it in group1_items if f'item_{it}' in X_test.columns]
        
        y_pred = np.zeros(len(X_test))
        if g1_cols:
            mask_g1_test = X_test[g1_cols].sum(axis=1) > 0
            if mask_g1_test.any():
                y_pred[mask_g1_test] = model_dict['model_1'].predict(X_test[mask_g1_test])
            if (~mask_g1_test).any():
                y_pred[~mask_g1_test] = model_dict['model_2'].predict(X_test[~mask_g1_test])
        else:
            y_pred = model_dict['model_2'].predict(X_test)
    else:
        # Single model fallback
        y_pred = model_dict.predict(X_test)
        
    y_pred_rounded = np.round(y_pred).clip(min=0)
    
    # Calculate Metrics
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred))
    exact_acc = np.mean(y_pred_rounded == y_test) * 100
    
    print('='*50)
    print(' TESTING EVALUATION METRICS')
    print('='*50)
    print(f"R2 Score:      {r2:.4f}")
    print(f"MAE:           {mae:.4f}")
    print(f"RMSE:          {rmse:.4f}")
    print(f"Exact Match %: {exact_acc:.2f}%")
    print('='*50)

    # Calculate Item-wise MAE
    df_test = df.iloc[split_idx:model_end_idx].copy()
    df_test['pred'] = y_pred_rounded
    df_test['actual'] = y_test
    
    item_mae = df_test.groupby('item').apply(lambda g: mean_absolute_error(g['actual'], g['pred']))
    print("\nItem-wise Hourly MAE:")
    print(item_mae.sort_values(ascending=False))
    
    # Check overall quantity predicted vs actual
    print("\nOverall Quantity Predicted vs Actual:")
    print(f"Actual Total: {y_test.sum()}")
    print(f"Predicted Total: {y_pred_rounded.sum()}")

if __name__ == "__main__":
    main()
