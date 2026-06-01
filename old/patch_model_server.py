import os

with open('ml/model_server.py', 'r', encoding='utf-8') as f:
    content = f.read()

new_handles = '''
        elif parsed_url.path == '/trigger_optuna':
            # Run in background
            threading.Thread(target=run_optuna_background).start()
            res_data = {'status': 'Optuna tuning started in background'}
'''

if "elif parsed_url.path == '/trigger_optuna':" not in content:
    if "if parsed_url.path == '/retrain':" in content:
        idx = content.find("if parsed_url.path == '/retrain':")
        content = content[:idx] + new_handles[1:] + content[idx:]

run_opt_bg = '''
def run_optuna_background():
    global global_df, global_feature_cols, global_lookups, is_training
    try:
        is_training = True
        print("[SERVER] Starting background Optuna tuning...")
        from get_predictions import prepare_data, extract_features, run_optuna_tuning
        df = fetch_orders_from_db()
        df, lookups, split_idx, model_end_idx = prepare_data(df)
        X, y, feature_cols, encoded_cat_cols = extract_features(df)
        run_optuna_tuning(X, y, split_idx, model_end_idx)
        print("[SERVER] Background Optuna tuning finished.")
    except Exception as e:
        print(f"[SERVER] Background Optuna tuning failed: {e}")
    finally:
        is_training = False
'''
if 'def run_optuna_background():' not in content:
    idx = content.find('class ModelServer')
    content = content[:idx] + run_opt_bg + '\n' + content[idx:]

with open('ml/model_server.py', 'w', encoding='utf-8') as f:
    f.write(content)
print('model_server.py optuna handles added.')
