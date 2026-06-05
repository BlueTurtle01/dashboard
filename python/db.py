"""
Shared database connection helper.
Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment or .env file.
Uses psycopg2 via the Supabase connection string for direct SQL access.
"""

import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))


def get_conn():
    """Return a psycopg2 connection using the Supabase direct DB URL."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        # Build from individual vars if DATABASE_URL not set
        host     = os.environ["SUPABASE_DB_HOST"]
        port     = os.environ.get("SUPABASE_DB_PORT", "5432")
        dbname   = os.environ.get("SUPABASE_DB_NAME", "postgres")
        user     = os.environ.get("SUPABASE_DB_USER", "postgres")
        password = os.environ["SUPABASE_DB_PASSWORD"]
        db_url   = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


def query_df(sql: str, params=None):
    """Execute SQL and return a pandas DataFrame."""
    import pandas as pd
    with get_conn() as conn:
        return pd.read_sql(sql, conn, params=params)
