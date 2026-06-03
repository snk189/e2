import sys, os, joblib, json
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
sys.path.append(r'c:\Users\RAMAKRISHNA\OneDrive\Desktop\e2\ml')

from model_server import fetch_orders_from_db
from get_predictions import prepare_data, extract_features

print("Loading June data...")
df = fetch_orders_from_db()
df, lookups, split_idx, model_end_idx = prepare_data(df)
X_model, y_model, feature_cols, encoded_cat_cols = extract_features(df)

# June data is everything after model_end_idx
X_june = X_model.iloc[model_end_idx:]
y_june = y_model.iloc[model_end_idx:]

if len(X_june) == 0:
    print("No June data found!")
    sys.exit(0)

print(f"Testing on {len(X_june)} rows for June...")
model_dict = joblib.load('lightgbm_model.joblib')

if isinstance(model_dict, dict) and 'model_1' in model_dict:
    # Use dual models
    group1_items = model_dict['group1_items']
    g1_cols = [f'item_{it}' for it in group1_items if f'item_{it}' in X_june.columns]
    mask_g1_june = X_june[g1_cols].sum(axis=1) > 0
    
    y_pred = np.zeros(len(X_june))
    if mask_g1_june.any():
        y_pred[mask_g1_june] = model_dict['model_1'].predict(X_june[mask_g1_june])
    if (~mask_g1_june).any():
        y_pred[~mask_g1_june] = model_dict['model_2'].predict(X_june[~mask_g1_june])
else:
    y_pred = model_dict.predict(X_june)

y_pred_rounded = np.round(y_pred).clip(min=0)

r2 = r2_score(y_june, y_pred)
mae = mean_absolute_error(y_june, y_pred)
rmse = np.sqrt(mean_squared_error(y_june, y_pred))
exact_acc = np.mean(y_pred_rounded == y_june) * 100

print('='*50)
print(' JUNE EVALUATION METRICS')
print('='*50)
print(f"R2 Score:      {r2:.4f}")
print(f"MAE:           {mae:.4f}")
print(f"RMSE:          {rmse:.4f}")
print(f"Exact Match %: {exact_acc:.2f}%")
print()

# Also calculate item-wise MAE
df_june = df.iloc[model_end_idx:].copy()
df_june['pred'] = y_pred_rounded
item_mae = df_june.groupby('item').apply(lambda g: mean_absolute_error(g['quantity'], g['pred']))
print("Item-wise Hourly MAE:")
print(item_mae.sort_values(ascending=False))

