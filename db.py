"""
Set the connection string first, e.g.
    export DATABASE_URL="postgresql://user:password@localhost:5432/weather"

Usage:
    python db.py init      # create tables and views from schema.sql
    python db.py check     # print row counts
"""
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg

SCHEMA_FILE = Path(__file__).with_name("schema.sql")


def get_conn() -> psycopg.Connection:
    """Open a connection using the DATABASE_URL environment variable."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg.connect(url)


def init_db(conn: psycopg.Connection) -> None:
    """Create all tables, indexes and views (safe to run repeatedly)."""
    with conn.cursor() as cur:
        cur.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
    conn.commit()


def insert_observation(conn: psycopg.Connection, obs_time: datetime, temperature_c,
                       humidity_pct, precipitation_mm, wind_speed_kmh) -> None:
    """Store one observation; a repeated obs_time is ignored."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO observations
                (obs_time, temperature_c, humidity_pct, precipitation_mm, wind_speed_kmh)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (obs_time) DO NOTHING
            """,
            (obs_time, temperature_c, humidity_pct, precipitation_mm, wind_speed_kmh),
        )
    conn.commit()


def insert_forecasts(conn: psycopg.Connection, issued_at: datetime, rows: list[dict]) -> int:
    """Store one forecast snapshot.

    Each row needs: target_time (datetime), temperature_c, humidity_pct,
    precipitation_mm, precip_prob_pct, wind_speed_kmh.
    lead_hours is computed from issued_at and target_time.
    Returns the number of rows actually inserted.
    """
    params = [
        (
            issued_at,
            r["target_time"],
            round((r["target_time"] - issued_at).total_seconds() / 3600),
            r.get("temperature_c"),
            r.get("humidity_pct"),
            r.get("precipitation_mm"),
            r.get("precip_prob_pct"),
            r.get("wind_speed_kmh"),
        )
        for r in rows
        if r["target_time"] >= issued_at  # skip past hours returned by the API
    ]
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO forecasts
                (issued_at, target_time, lead_hours, temperature_c, humidity_pct,
                 precipitation_mm, precip_prob_pct, wind_speed_kmh)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (issued_at, target_time) DO NOTHING
            """,
            params,
        )
        inserted = cur.rowcount
    conn.commit()
    return inserted


def log_run(conn: psycopg.Connection, job: str, status: str,
            http_status: int | None = None, message: str | None = None) -> None:
    """Record one collector run ('observation' or 'forecast'; 'ok' or 'error')."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO collector_log (job, status, http_status, message) VALUES (%s, %s, %s, %s)",
            (job, status, http_status, message),
        )
    conn.commit()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    with get_conn() as connection:
        if cmd == "init":
            init_db(connection)
            print("Schema created.")
        elif cmd == "check":
            with connection.cursor() as c:
                for table in ("observations", "forecasts", "collector_log"):
                    c.execute(f"SELECT count(*) FROM {table}")
                    print(f"{table}: {c.fetchone()[0]} rows")
        else:
            print(__doc__)
