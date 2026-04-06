import pandas as pd
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor   # safer than xgboost

# load data
df = pd.read_csv("smart_canteen_final_realistic.csv")

# ---- CLEANING ----

# convert prebooking_time → hour safely
df["prebooking_hour"] = pd.to_datetime(
    df["prebooking_time"], errors="coerce"
).dt.hour.fillna(0).astype(int)

# encode item
df = pd.get_dummies(df, columns=["item"])

# ---- FEATURES ----
X = df.drop(["quantity", "timestamp", "prebooking_date", "prebooking_time"], axis=1)
y = df["quantity"]

# split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# model
model = RandomForestRegressor(n_estimators=100)
model.fit(X_train, y_train)

# ---- PREDICTION ----

def predict(date):
    dt = datetime.strptime(date, "%Y-%m-%d")
    day = (dt.weekday() + 1) % 7  # 0=Sunday

    results = []

    for hour in range(8, 24):
        for item in ["dosa", "idli", "vada", "poori"]:

            row = {
                "time_slot": hour,
                "day_of_week": day,
                "peak_hour": 1 if hour in [8,9,10,12,13,14,17,18,19,20] else 0,
                "is_prebooking": 1 if hour >= 12 else 0,
                "prebooking_hour": hour - 1
            }

            # one-hot encoding
            for i in ["dosa", "idli", "vada", "poori"]:
                row[f"item_{i}"] = 1 if i == item else 0

            pred = model.predict(pd.DataFrame([row]))[0]
            results.append((item, hour, round(pred,2)))

    return results

# ---- RUN ----
date = input("Enter date (YYYY-MM-DD): ")
output = predict(date)

for item, hour, val in output:
    print(item, "Hour", hour, ":", val)