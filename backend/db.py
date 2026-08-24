import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "doctask.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'synthetic',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_name TEXT NOT NULL,
            rules TEXT NOT NULL,
            document_ids TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'created',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            document_id INTEGER,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            decision TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY(run_id) REFERENCES runs(id),
            FOREIGN KEY(document_id) REFERENCES documents(id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS onboarding_kits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_name TEXT NOT NULL,
            procedures TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)

    count = cur.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]
    if count == 0:
        seed = [
            ("Resume - Sample", "Candidate resume: experience, skills and education.", "sample"),
            ("Marksheet - Sample", "Candidate marksheet: subjects, marks and totals.", "sample"),
            ("Invoice - Sample", "Invoice with customer, amount and due date.", "sample")
        ]
        cur.executemany(
            "INSERT INTO documents(title, content, source) VALUES (?, ?, ?)",
            seed
        )

    conn.commit()
    conn.close()
