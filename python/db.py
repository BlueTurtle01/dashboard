"""
Shared database connection helper.
Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment or .env file.
Uses psycopg2 via the Supabase connection string for direct SQL access.
"""

import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

_here = os.path.dirname(__file__)
load_dotenv(dotenv_path=os.path.join(_here, ".env"))                       # python/.env  (takes priority)
load_dotenv(dotenv_path=os.path.join(_here, "..", ".env.local"))           # root .env.local (fallback)


def get_conn():
    """Return a psycopg2 connection using the Supabase direct DB URL."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        host     = os.environ.get("SUPABASE_DB_HOST")
        password = os.environ.get("SUPABASE_DB_PASSWORD")
        if not host or not password:
            raise RuntimeError(
                "No database credentials found. Add DATABASE_URL to python/.env or .env.local.\n"
                "Find it in Supabase Dashboard → Project Settings → Database → Connection string (URI)."
            )
        port   = os.environ.get("SUPABASE_DB_PORT", "5432")
        dbname = os.environ.get("SUPABASE_DB_NAME", "postgres")
        user   = os.environ.get("SUPABASE_DB_USER", "postgres")
        db_url = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    return psycopg2.connect(db_url, cursor_factory=psycopg2.extras.RealDictCursor)


def query_df(sql: str, params=None):
    """Execute SQL and return a pandas DataFrame."""
    import pandas as pd
    import psycopg2
    # Use a plain connection (not RealDictCursor) so pandas can read column names correctly
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        host     = os.environ.get("SUPABASE_DB_HOST")
        password = os.environ.get("SUPABASE_DB_PASSWORD")
        port     = os.environ.get("SUPABASE_DB_PORT", "5432")
        dbname   = os.environ.get("SUPABASE_DB_NAME", "postgres")
        user     = os.environ.get("SUPABASE_DB_USER", "postgres")
        db_url   = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    with psycopg2.connect(db_url) as conn:
        return pd.read_sql(sql, conn, params=params)
