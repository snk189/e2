import pandas as pd
import numpy as np

# Sample data
data = {'item': ['A']*6, 'time_slot': [8, 8, 8, 8, 8, 8], 'quantity': [10, 20, 30, 40, 50, 60]}
df = pd.DataFrame(data)

df['prev_qty'] = df.groupby(['item', 'time_slot'])['quantity'].shift(1).fillna(0)
df['rolling_mean_3'] = df.groupby(['item', 'time_slot'])['quantity'].shift(1).rolling(3).mean().reset_index(level=0, drop=True).fillna(0)

# Computing the lookup for the NEXT day:
latest_trend = df.groupby(['item', 'time_slot'])['quantity'].rolling(3).mean().groupby(['item', 'time_slot']).last().to_dict()
latest_prev = df.groupby(['item', 'time_slot'])['quantity'].last().to_dict()

print("DF:")
print(df)
print("\nLookups:")
print("latest_trend:", latest_trend)
print("latest_prev:", latest_prev)
