import json
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import get_connection, init_db

app = FastAPI(title="DocTask API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SyntheticSource(BaseModel):
    title: str = "Synthetic Source"
    content: str = "Synthetic document source."


class RunRequest(BaseModel):
    document_ids: list[Any] = Field(default_factory=list)
    selected_document_ids: list[Any] = Field(default_factory=list)
    rules: str = "resume, marksheet"
    role_name: str = "AR Analyst"
    role: str = "AR Analyst"


class DecisionRequest(BaseModel):
    decision: str


class KitRequest(BaseModel):
    role_name: str = "AR Analyst"
    procedures: list[str] = Field(default_factory=list)


def row_to_dict(row):
    return dict(row) if row else None


def get_run(run_id: int):
    conn = get_connection()
    run = conn.execute(
        "SELECT * FROM runs WHERE id = ?", (run_id,)
    ).fetchone()

    if not run:
        conn.close()
        raise HTTPException(status_code=404, detail="Run not found")

    proposals = conn.execute(
        "SELECT * FROM proposals WHERE run_id = ? ORDER BY id",
        (run_id,)
    ).fetchall()

    result = dict(run)
    result["document_ids"] = json.loads(result["document_ids"])
    result["proposals"] = [dict(p) for p in proposals]
    result["proposals_list"] = result["proposals"]
    conn.close()
    return result


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {"name": "DocTask API", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents")
def documents():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM documents ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


@app.post("/sources/synthetic")
def add_synthetic_source(source: SyntheticSource):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO documents(title, content, source) VALUES (?, ?, ?)",
        (source.title, source.content, "synthetic")
    )
    conn.commit()
    document_id = cur.lastrowid
    row = conn.execute(
        "SELECT * FROM documents WHERE id = ?", (document_id,)
    ).fetchone()
    conn.close()
    return dict(row)


@app.post("/runs")
def create_run(request: RunRequest):
    document_ids = request.document_ids or request.selected_document_ids

    if not document_ids:
        raise HTTPException(status_code=400, detail="At least one document is required")

    normalized_ids = []
    for item in document_ids:
        try:
            normalized_ids.append(int(item))
        except (TypeError, ValueError):
            continue

    if not normalized_ids:
        raise HTTPException(status_code=400, detail="No valid document IDs supplied")

    role_name = request.role_name or request.role or "AR Analyst"

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO runs(role_name, rules, document_ids, status)
        VALUES (?, ?, ?, ?)
        """,
        (role_name, request.rules, json.dumps(normalized_ids), "review")
    )

    run_id = cur.lastrowid

    for doc_id in normalized_ids:
        doc = conn.execute(
            "SELECT title FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()

        if not doc:
            continue

        cur.execute(
            """
            INSERT INTO proposals(run_id, document_id, title, description)
            VALUES (?, ?, ?, ?)
            """,
            (
                run_id,
                doc_id,
                f"Review {doc['title']}",
                f"Review the selected document against the configured rules: {request.rules}."
            )
        )

    conn.commit()
    conn.close()

    return get_run(run_id)


@app.get("/runs/{run_id}")
def read_run(run_id: int):
    return get_run(run_id)


@app.post("/runs/{run_id}/resume")
def resume_run(run_id: int):
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM runs WHERE id = ?", (run_id,)
    ).fetchone()

    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Run not found")

    conn.execute(
        "UPDATE runs SET status = ? WHERE id = ?",
        ("review", run_id)
    )
    conn.commit()
    conn.close()

    return get_run(run_id)


@app.post("/proposals/{proposal_id}/decision")
def decide_proposal(proposal_id: int, request: DecisionRequest):
    decision = request.decision.lower().strip()

    if decision not in {"approved", "rejected", "pending"}:
        raise HTTPException(
            status_code=400,
            detail="Decision must be approved, rejected or pending"
        )

    conn = get_connection()
    proposal = conn.execute(
        "SELECT * FROM proposals WHERE id = ?", (proposal_id,)
    ).fetchone()

    if not proposal:
        conn.close()
        raise HTTPException(status_code=404, detail="Proposal not found")

    conn.execute(
        "UPDATE proposals SET decision = ? WHERE id = ?",
        (decision, proposal_id)
    )
    conn.commit()
    run_id = proposal["run_id"]
    conn.close()

    return {
        "proposal_id": proposal_id,
        "decision": decision,
        "run": get_run(run_id)
    }


@app.post("/runs/{run_id}/commit")
def commit_run(run_id: int):
    conn = get_connection()
    run = conn.execute(
        "SELECT id FROM runs WHERE id = ?", (run_id,)
    ).fetchone()

    if not run:
        conn.close()
        raise HTTPException(status_code=404, detail="Run not found")

    pending = conn.execute(
        """
        SELECT COUNT(*) AS c
        FROM proposals
        WHERE run_id = ? AND decision = 'pending'
        """,
        (run_id,)
    ).fetchone()["c"]

    if pending:
        conn.close()
        raise HTTPException(
            status_code=409,
            detail="All proposals must be approved or rejected before commit"
        )

    conn.execute(
        "UPDATE runs SET status = ? WHERE id = ?",
        ("committed", run_id)
    )
    conn.commit()
    conn.close()

    return get_run(run_id)


@app.post("/onboarding/kits")
def create_onboarding_kit(request: KitRequest):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO onboarding_kits(role_name, procedures)
        VALUES (?, ?)
        """,
        (request.role_name, json.dumps(request.procedures))
    )

    conn.commit()
    kit_id = cur.lastrowid
    conn.close()

    return {
        "id": kit_id,
        "role_name": request.role_name,
        "procedures": request.procedures,
        "status": "created"
    }
