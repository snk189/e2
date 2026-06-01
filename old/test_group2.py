import pandas as pd
import numpy as np

data = {'item': ['A']*6, 'time_slot': [8, 8, 8, 8, 8, 8], 'quantity': [10, 20, 30, 40, 50, 60]}
df = pd.DataFrame(data)

df['rolling_mean_3'] = df.groupby(['item', 'time_slot'])['quantity'].shift(1).rolling(3).mean().reset_index(level=[0,1], drop=True).fillna(0)
print(df)
