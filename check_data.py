import pandas as pd

df = pd.read_csv('data.csv')

print("--- DataFrame Info ---")
print(df.info())

print("\n--- Missing Values ---")
print(df.isnull().sum())

print("\n--- Value Counts for categorical columns ---")
for col in ['item', 'day_of_week', 'is_prebooking']:
    print(f"\n{col}:")
    print(df[col].value_counts())

print("\n--- Summary Statistics ---")
print(df[['time_slot', 'quantity', 'timestamp']].describe())

print("\n--- Prebooking consistency ---")
prebook_missing_date = df[df['is_prebooking'] == 1]['prebooking_date'].isnull().sum()
non_prebook_has_date = df[df['is_prebooking'] == 0]['prebooking_date'].notnull().sum()
print(f"Prebookings missing date: {prebook_missing_date}")
print(f"Non-prebookings with date: {non_prebook_has_date}")

