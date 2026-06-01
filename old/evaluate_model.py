import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from catboost import CatBoostRegressor
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from get_predictions import prepare_data, extract_features
from model_server import fetch_orders_from_db

def evaluate_models():
    print("Fetching data from DB...")
    df = fetch_orders_from_db()
    if df.empty:
        print("Database is empty.")
        return

    print("Preparing and splitting data (Chronological split)...")
    # prepare_data automatically handles the chronological split (cutoff at 20-04-2026)
    df, lookups, split_idx, model_end_idx = prepare_data(df)
    
    print("Extracting features...")
    X, y, feature_cols, encoded_cat_cols = extract_features(df)
    
    X_model = X.iloc[:model_end_idx]
    y_model = y.iloc[:model_end_idx]
    
    split_idx = min(split_idx, model_end_idx)
    
    # Strictly chronological split (Train on data <= Apr 20, Test on data > Apr 20)
    X_train, X_test = X_model.iloc[:split_idx], X_model.iloc[split_idx:]
    y_train, y_test = y_model.iloc[:split_idx], y_model.iloc[split_idx:]
    
    if len(X_test) == 0:
        print("Not enough data to form a test set! Need data after the cutoff date.")
        return
        
    print(f"Training Set Size (Past Days): {len(X_train)} rows")
    print(f"Test Set Size (Future Days): {len(X_test)} rows")
    
    print("\n[WAIT] Tuning XGBoost Model on Training Set...")
    param_grid = {
        'n_estimators': [300, 500],
        'max_depth': [6, 8],
        'learning_rate': [0.05, 0.1]
    }
    
    xgb = XGBRegressor(random_state=42, n_jobs=-1)
    tscv = TimeSeriesSplit(n_splits=3)
    grid = GridSearchCV(xgb, param_grid, cv=tscv, scoring='neg_mean_absolute_error', n_jobs=-1)
    grid.fit(X_train, y_train)

    print("[WAIT] Training Final XGBoost on Training Set...")
    xgb_final = XGBRegressor(**grid.best_params_, random_state=42, n_jobs=-1)
    xgb_final.fit(X_train, y_train)

    print("[WAIT] Training Final CatBoost on Training Set...")
    cb_final = CatBoostRegressor(iterations=700, depth=6, learning_rate=0.05, random_seed=42, verbose=False)
    cb_final.fit(X_train, y_train)

    print("\n[EVALUATION] Generating Predictions on Test Set (Unseen Future Days)...")
    xgb_preds = xgb_final.predict(X_test)
    cb_preds = cb_final.predict(X_test)
    
    ensemble_preds = 0.499 * xgb_preds + 0.501 * cb_preds
    
    def evaluate(name, preds):
        preds_rounded = np.round(preds).clip(min=0)
        
        r2 = r2_score(y_test, preds)
        mae = mean_absolute_error(y_test, preds)
        rmse = np.sqrt(mean_squared_error(y_test, preds))
        exact_acc = np.mean(preds_rounded == y_test) * 100
        
        print(f"\n============= {name} Evaluation =============")
        print(f"R² Score: {r2:.4f}")
        print(f"Mean Absolute Error (MAE): {mae:.4f}")
        print(f"Root Mean Squared Error (RMSE): {rmse:.4f}")
        print(f"Exact Integer Match Accuracy: {exact_acc:.2f}%")

    evaluate("XGBoost + CatBoost Ensemble", ensemble_preds)

if __name__ == "__main__":
    evaluate_models()
