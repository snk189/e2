import csv
import random
import os

USERS_FILE = 'users.csv'
DATA_FILE = 'data1.csv'

# Generate 100 users
users = []
for i in range(1, 101):
    users.append(f"user{i}")

with open(USERS_FILE, 'w', newline='') as f:
    f.write("username,password,type\n")
    f.write("management,admin,m\n")
    for u in users:
        f.write(f"{u},pass123,n\n")

# Read data1.csv
with open(DATA_FILE, 'r') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

fieldnames = ['username', 'item', 'time_slot', 'quantity', 'timestamp', 'day_of_week', 'is_prebooking', 'prebooking_date', 'prebooking_time']

for row in rows:
    item = row['item'].lower()
    if 'dosa' in item:
        uname = f"user{random.randint(1, 25)}"
    elif 'pizza' in item:
        uname = f"user{random.randint(26, 50)}"
    elif 'sandwich' in item:
        uname = f"user{random.randint(51, 70)}"
    elif 'milkshake' in item:
        uname = f"user{random.randint(71, 85)}"
    else:  # tea
        uname = f"user{random.randint(86, 100)}"
        
    row['username'] = uname

with open(DATA_FILE, 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        filtered_row = {k: v for k, v in row.items() if k in fieldnames}
        # In case 'username' wasn't set (should be though)
        if 'username' not in filtered_row:
             filtered_row['username'] = 'user1'
        writer.writerow(filtered_row)

print("Backfill complete. Generated 100 users with 'pass123' and injected deep correlations to data1.csv.")
