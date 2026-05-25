import os
import pandas as pd
from sqlalchemy import create_engine, text

def main():
    user = os.environ.get('PGUSER', 'postgres')
    password = os.environ.get('PGPASSWORD', 'admin')
    host = os.environ.get('PGHOST', 'localhost')
    port = os.environ.get('PGPORT', '5432')
    database = os.environ.get('PGDATABASE', 'bitespeed')

    # Connect to the default postgres database to create the bitespeed db if it doesn't exist
    engine_default = create_engine(f'postgresql://{user}:{password}@{host}:{port}/postgres')
    
    with engine_default.connect() as conn:
        conn.execution_options(isolation_level="AUTOCOMMIT")
        result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname='bitespeed'")).fetchone()
        if not result:
            print("Creating database bitespeed...")
            conn.execute(text("CREATE DATABASE bitespeed"))
        else:
            print("Database bitespeed already exists.")
            
    engine = create_engine(f'postgresql://{user}:{password}@{host}:{port}/{database}')
    
    # 1. users
    print("Migrating users.csv...")
    if os.path.exists('users/users.csv'):
        users_df = pd.read_csv('users/users.csv')
        users_df.to_sql('users', engine, if_exists='replace', index=False)
        with engine.connect() as conn:
            conn.execute(text('ALTER TABLE users ADD PRIMARY KEY (username);'))
            conn.commit()
            
    # 2. pending_users
    print("Migrating pending_users.csv...")
    if os.path.exists('users/pending_users.csv'):
        pend_df = pd.read_csv('users/pending_users.csv')
        pend_df.to_sql('pending_users', engine, if_exists='replace', index=False)
        with engine.connect() as conn:
            conn.execute(text('ALTER TABLE pending_users ADD PRIMARY KEY (username);'))
            conn.commit()

    # 3. blocked_users
    print("Migrating blocked_users.csv...")
    if os.path.exists('users/blocked_users.csv'):
        block_df = pd.read_csv('users/blocked_users.csv')
        block_df.to_sql('blocked_users', engine, if_exists='replace', index=False)
        with engine.connect() as conn:
            conn.execute(text('ALTER TABLE blocked_users ADD PRIMARY KEY (username);'))
            conn.commit()

    # 4. rejected_users
    print("Migrating rejected_users.csv...")
    if os.path.exists('users/rejected_users.csv'):
        rej_df = pd.read_csv('users/rejected_users.csv')
        rej_df.to_sql('rejected_users', engine, if_exists='replace', index=False)
        with engine.connect() as conn:
            conn.execute(text('ALTER TABLE rejected_users ADD PRIMARY KEY (username);'))
            conn.commit()

    # 5. orders
    print("Migrating data1.csv (orders)...")
    if os.path.exists('ml/data1.csv'):
        orders_df = pd.read_csv('ml/data1.csv')
        orders_df.to_sql('orders', engine, if_exists='replace', index=False)

    print("Migration complete.")

if __name__ == '__main__':
    main()
