import pandas as pd
import numpy as np
from datetime import datetime
import os
import random

def assign_users(df):
    print("Assigning user IDs based on frequency...")
    # 500 total students. 200 regular, 300 occasional.
    regular_users = [f"user{i}" for i in range(1, 201)]
    occasional_users = [f"user{i}" for i in range(201, 501)]
    
    # We will simulate user assignment. 
    # High frequency orders: Let's find patterns, or just probabilistically assign.
    # 80% of orders go to regular users, 20% to occasional.
    users_assigned = []
    
    # Generate users.csv data
    users_data = []
    for u in regular_users:
        # Default password is password, type n
        users_data.append({'username': u, 'password': 'password', 'type': 'n', 'user_type': 'regular'})
    for u in occasional_users:
        users_data.append({'username': u, 'password': 'password', 'type': 'n', 'user_type': 'occasional'})
        
    users_df = pd.DataFrame(users_data)
    
    # Ensure users dir exists
    os.makedirs('users', exist_ok=True)
    users_df[['username', 'password', 'type']].to_csv('users/users.csv', index=False)
    print("Created users/users.csv")
    
    # Assign to dataset
    np.random.seed(42)
    # create an array of user choices with 80/20 probability
    choices = np.random.choice([0, 1], size=len(df), p=[0.8, 0.2])
    
    user_col = []
    for c in choices:
        if c == 0:
            user_col.append(np.random.choice(regular_users))
        else:
            user_col.append(np.random.choice(occasional_users))
            
    df.insert(0, 'user_id', user_col)
    return df

def process_dataset(input_file, output_file):
    print(f"Reading {input_file}...")
    df = pd.read_csv(input_file)
    
    df = assign_users(df)
    
    print("Transforming columns...")
    # Rename timestamp to order_timestamp
    if 'timestamp' in df.columns:
        df = df.rename(columns={'timestamp': 'order_timestamp'})
        
    # Combine prebooking_date and prebooking_time to prebooking_datetime
    prebooking_datetimes = []
    for idx, row in df.iterrows():
        if row.get('is_prebooking', 0) == 1 and pd.notna(row.get('prebooking_date')) and pd.notna(row.get('prebooking_time')):
            try:
                # Assuming prebooking_date is YYYY-MM-DD and prebooking_time is HH:MM
                dt_str = f"{row['prebooking_date']} {row['prebooking_time']}"
                if '-' in str(row['prebooking_date']) and len(str(row['prebooking_date'])) == 10:
                    # check format
                    parts = str(row['prebooking_date']).split('-')
                    if len(parts[0]) == 2: # DD-MM-YYYY
                         dt_obj = datetime.strptime(dt_str, '%d-%m-%Y %H:%M')
                    else:
                         dt_obj = datetime.strptime(dt_str, '%Y-%m-%d %H:%M')
                else:
                    dt_obj = datetime.strptime(dt_str, '%Y-%m-%d %H:%M')
                prebooking_datetimes.append(int(dt_obj.timestamp()))
            except Exception as e:
                prebooking_datetimes.append(pd.NA)
        else:
            prebooking_datetimes.append(pd.NA)
            
    df['prebooking_datetime'] = prebooking_datetimes
    
    # Drop old prebooking columns if they exist
    if 'prebooking_date' in df.columns:
        df = df.drop(columns=['prebooking_date'])
    if 'prebooking_time' in df.columns:
        df = df.drop(columns=['prebooking_time'])
        
    # Add is_delivered
    df['is_delivered'] = False
    
    # Ensure correct column order: user_id, date, item, time_slot, quantity, order_timestamp, is_holiday, is_bridge_day, season, temperature_celsius, weather, is_exam_week, is_prebooking, prebooking_datetime, is_delivered
    # Note: data.csv originally had: date,item,time_slot,quantity,timestamp,is_holiday,is_bridge_day,season,temperature_celsius,weather,is_exam_week,is_prebooking,prebooking_date,prebooking_time
    
    # Let's just keep the columns in order
    cols = ['user_id', 'date', 'item', 'time_slot', 'quantity', 'order_timestamp', 'is_holiday', 'is_bridge_day', 'season', 'temperature_celsius', 'weather', 'is_exam_week', 'is_prebooking', 'prebooking_datetime', 'is_delivered']
    df = df[[c for c in cols if c in df.columns]]
    
    print(f"Writing to {output_file}...")
    df.to_csv(output_file, index=False)
    print("Done!")

if __name__ == "__main__":
    if os.path.exists('data.csv'):
        process_dataset('data.csv', 'data1.csv')
    else:
        print("data.csv not found!")
