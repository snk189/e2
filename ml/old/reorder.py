import pandas as pd

# Load dataset
df = pd.read_csv("data.csv")

# Remove peak_hour column
df = df.drop(columns=["peak_hour"])

# Save updated dataset
df.to_csv("canteen_no_peak.csv", index=False)

print("peak_hour column removed successfully.")