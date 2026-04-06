import pandas as pd

# load your csv
df = pd.read_csv("smart_canteen_final_realistic.csv")

# get columns
cols = list(df.columns)

# remove column
cols.remove("is_prebooking")

# find index of prebooking_date
idx = cols.index("prebooking_date")

# insert is_prebooking before it
cols.insert(idx, "is_prebooking")

# reorder dataframe
df = df[cols]

# save back
df.to_csv("updated_dataset.csv", index=False)

print("Done. Column moved.")
