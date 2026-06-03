import os
import sys

# Ensure the working directory is the ml folder
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from model_server import fetch_orders_from_db
from get_predictions import prepare_data, extract_features, train_split_models

print("[SERVER] Connecting to DB to fetch orders...")
df = fetch_orders_from_db()

print("[SERVER] Preparing Data...")
df, lookups, split_idx, model_end_idx = prepare_data(df)

print("[SERVER] Extracting Features...")
X_model, y_model, feature_cols, encoded_cat_cols = extract_features(df)

train_split_models(X_model, y_model, split_idx, model_end_idx)
print("Finished!")
