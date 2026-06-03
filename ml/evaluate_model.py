import json
import joblib

model = joblib.load('lightgbm_model.joblib')
with open('optuna_params.json', 'r') as f:
    data = json.load(f)

print('='*50)
print(' MODEL EVALUATION METRICS')
print('='*50)
print(f"R2 Score:      {data['r2']:.4f}")
print(f"MAE:           {data['mae']:.4f}")
print(f"RMSE:          {data['rmse']:.4f}")
print(f"Exact Match %: {data['exact_acc']:.2f}%")
print()

print('='*50)
print(' TOP 10 FEATURES')
print('='*50)
importances = model.feature_importances_
features = data['feature_cols']
feature_importances = list(zip(features, importances))
feature_importances.sort(key=lambda x: x[1], reverse=True)
print(f"{'Feature Name':<35} | Importance Score")
print('-'*55)
for feat, imp in feature_importances[:10]:
    print(f"{feat:<35} | {imp}")
