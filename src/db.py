import os
from dotenv import load_dotenv
from clickhouse_driver import Client

load_dotenv()

# Initialize the single ClickHouse connection client
clickhouse = Client(
    host=os.getenv('CLICKHOUSE_HOST', 'localhost'),
    port=int(os.getenv('CLICKHOUSE_PORT', 8123)),
    user=os.getenv('CLICKHOUSE_USER', 'aryan_analytics'),
    password=os.getenv('CLICKHOUSE_PASSWORD', 'analytics_password_99'),
    database=os.getenv('CLICKHOUSE_DB', 'log_analytics_db'),
    settings={'use_numpy': True}
)


def init_db() -> None:
    """Bootstraps the analytical storage engine"""
    try:
        clickhouse.execute("""
            CREATE TABLE IF NOT EXISTS analytical_topics (
                topic_id UUID,
                cluster_id Int32,
                label String,
                pm_insight String,
                sample_size UInt32,
                raw_log_samples Array(String),
                created_at DateTime DEFAULT now()
            ) ENGINE = MergeTree()
            PRIMARY KEY (topic_id)
            ORDER BY (topic_id, created_at)
        """)
        print("ClickHouse pure OLAP engine tables initialized successfully.")
    except Exception as error:
        print(f"ClickHouse initialization layers failed to bootstrap: {error}")
        raise error


def run_clickhouse_query(sql: str) -> list:
    """Helper to wrap SELECT queries"""
    try:
        result = clickhouse.execute(sql)
        # Convert results to list of dicts for compatibility
        return result
    except Exception as error:
        print(f"ClickHouse query failed: {error}")
        raise error
