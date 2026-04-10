import pandas as pd
import random

file_path = 'data.csv'
df = pd.read_csv(file_path)
items = ['dosa', 'milkshake', 'sandwich', 'pizza', 'tea']

# Make it completely uniform by repeating the items and then shuffling
n = len(df)
new_items = (items * (n // len(items) + 1))[:n]
random.shuffle(new_items)
df['item'] = new_items

# We could also modify the quantities slightly to be more realistic for these items but prompt didn't ask 
df.to_csv(file_path, index=False)
print("done")
