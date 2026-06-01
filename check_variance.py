import pandas as pd
from sqlalchemy import create_engine
import os

user = os.environ.get('PGUSER', 'postgres')
password = os.environ.get('PGPASSWORD', 'admin')
host = os.environ.get('PGHOST', 'localhost')
port = os.environ.get('PGPORT', '5432')
database = os.environ.get('PGDATABASE', 'bitespeed')

engine = create_engine(f'postgresql://{user}:{password}@{host}:{port}/{database}')
df = pd.read_sql("SELECT item, date_trunc('day', to_timestamp(order_timestamp)) as day, sum(quantity) as daily_qty FROM orders WHERE item IN ('juice', 'pulao') GROUP BY item, day ORDER BY day", engine)

print("Juice daily stats:")
print(df[df['item'] == 'juice']['daily_qty'].describe())
print("\nPulao daily stats:")
print(df[df['item'] == 'pulao']['daily_qty'].describe())
