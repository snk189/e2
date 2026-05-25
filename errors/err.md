Replace CSV-based data pipeline with PostgreSQL integration. ML training script should fetch data using SQL queries via psycopg2 or SQLAlchemy, convert to pandas DataFrame, and eliminate dependency on data1.csv. Maintain schema consistency and ensure time-series ordering for demand forecasting.
Maintain compatibility with existing frontend APIs. No frontend changes should be required.
Goal: fully eliminate CSV-based storage and make PostgreSQL the single source of truth for both application data and ML training pipeline.
the user credentials is the normal things with password as admin