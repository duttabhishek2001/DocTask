import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json")
    ? response.json()
    : response.text();
}

function App() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState([]);
  const [rules, setRules] = useState("resume, marksheet");
  const [role, setRole] = useState("AR Analyst");
  const [run, setRun] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sourceTitle, setSourceTitle] = useState("Synthetic Source");
  const [sourceContent, setSourceContent] = useState(
    "Synthetic document source created for testing."
  );

  async function loadDocuments() {
    try {
      const data = await apiFetch("/documents");
      setDocs(Array.isArray(data) ? data : data.documents || []);
    } catch (error) {
      console.error(error);
      setMessage(`Could not load documents: ${error.message}`);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  function toggleDocument(documentId) {
    setSelected((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  }

  async function addSyntheticSource() {
    setLoading(true);
    setMessage("");
    try {
      await apiFetch("/sources/synthetic", {
        method: "POST",
        body: JSON.stringify({
          title: sourceTitle,
          content: sourceContent
        })
      });
      await loadDocuments();
      setMessage("Synthetic source added successfully.");
    } catch (error) {
      console.error(error);
      setMessage(`Failed to add source: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function startRun() {
    if (!selected.length) {
      setMessage("Select at least one document.");
      return;
    }

    setLoading(true);
    setMessage("");

    const payload = {
      document_ids: selected,
      selected_document_ids: selected,
      rules,
      role_name: role,
      role
    };

    try {
      const data = await apiFetch("/runs", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setRun(data);
      setProposals(
        Array.isArray(data.proposals)
          ? data.proposals
          : Array.isArray(data.proposals_list)
            ? data.proposals_list
            : []
      );
      setMessage("Agent run created successfully.");

      if (data.id) {
        await refreshRun(data.id);
      }
    } catch (error) {
      console.error(error);
      setMessage(`Run failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function refreshRun(runId = run?.id) {
    if (!runId) return;

    try {
      const data = await apiFetch(`/runs/${runId}`);
      setRun(data);

      const nextProposals = Array.isArray(data.proposals)
        ? data.proposals
        : Array.isArray(data.proposals_list)
          ? data.proposals_list
          : [];

      setProposals(nextProposals);
    } catch (error) {
      console.error(error);
      setMessage(`Could not refresh run: ${error.message}`);
    }
  }

  async function resumeRun() {
    if (!run?.id) {
      setMessage("No run available.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await apiFetch(`/runs/${run.id}/resume`, {
        method: "POST"
      });

      setRun(data);
      if (Array.isArray(data.proposals)) {
        setProposals(data.proposals);
      }
      setMessage("Run resumed.");
      await refreshRun(run.id);
    } catch (error) {
      console.error(error);
      setMessage(`Resume failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function decideProposal(proposalId, decision) {
    if (!proposalId) {
      setMessage("Proposal ID is missing.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await apiFetch(`/proposals/${proposalId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision })
      });

      if (data.run) {
        setRun(data.run);
      }

      setProposals((current) =>
        current.map((proposal) =>
          String(proposal.id) === String(proposalId)
            ? { ...proposal, decision, status: decision }
            : proposal
        )
      );

      setMessage(`Proposal ${decision}.`);
    } catch (error) {
      console.error(error);
      setMessage(`Decision failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function commitRun() {
    if (!run?.id) {
      setMessage("No run available.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const data = await apiFetch(`/runs/${run.id}/commit`, {
        method: "POST"
      });

      setRun(data);
      if (Array.isArray(data.proposals)) {
        setProposals(data.proposals);
      }
      setMessage("Approved decisions committed successfully.");
      await refreshRun(run.id);
    } catch (error) {
      console.error(error);
      setMessage(`Commit failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function buildKit() {
    setLoading(true);
    setMessage("");

    try {
      const data = await apiFetch("/onboarding/kits", {
        method: "POST",
        body: JSON.stringify({
          role_name: role,
          procedures: [
            "Handle daily queues",
            "Review documents",
            "Escalate decisions",
            "Maintain audit trail"
          ]
        })
      });

      console.log("Onboarding kit:", data);
      setMessage("Onboarding kit created successfully.");
    } catch (error) {
      console.error(error);
      setMessage(`Kit creation failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  const visibleProposals = useMemo(() => {
    if (proposals.length) return proposals;
    return run?.proposals || run?.proposals_list || [];
  }, [proposals, run]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">DOCUMENT OPERATIONS</div>
          <h1>DocTask</h1>
          <p>Human-gated agent workspace for document review.</p>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          API: {API}
        </div>
      </header>

      <main className="container">
        {message && <div className="message">{message}</div>}

        <section className="hero card">
          <div>
            <span className="tag">Agent Review</span>
            <h2>Review documents, evaluate proposals, commit decisions.</h2>
            <p>
              Select source documents, configure the analyst role and review
              rules, then run the workflow with explicit human approval.
            </p>
          </div>
          <div className="hero-stat">
            <strong>{docs.length}</strong>
            <span>documents</span>
          </div>
        </section>

        <div className="grid two">
          <section className="card">
            <div className="section-heading">
              <div>
                <span className="step">01</span>
                <h3>Source File</h3>
              </div>
              <button className="secondary" onClick={loadDocuments}>
                Refresh
              </button>
            </div>

            <div className="document-list">
              {docs.length === 0 ? (
                <div className="empty">No documents available.</div>
              ) : (
                docs.map((doc) => {
                  const id = doc.id;
                  const checked = selected.includes(id);

                  return (
                    <label
                      className={`document-row ${checked ? "selected" : ""}`}
                      key={id}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDocument(id)}
                      />
                      <div className="document-icon">DOC</div>
                      <div className="document-info">
                        <strong>{doc.title || doc.name || `Document ${id}`}</strong>
                        <span>
                          {doc.source || doc.type || "source"} · ID {id}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="subcard">
              <h4>Add synthetic source</h4>
              <input
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="Source title"
              />
              <textarea
                value={sourceContent}
                onChange={(e) => setSourceContent(e.target.value)}
                placeholder="Source content"
                rows="4"
              />
              <button onClick={addSyntheticSource} disabled={loading}>
                Add Synthetic Source
              </button>
            </div>
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <span className="step">02</span>
                <h3>Agent Configuration</h3>
              </div>
            </div>

            <label className="field">
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option>AR Analyst</option>
                <option>Senior AR Analyst</option>
                <option>Document Reviewer</option>
                <option>Operations Analyst</option>
              </select>
            </label>

            <label className="field">
              <span>Rules</span>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows="5"
                placeholder="resume, marksheet"
              />
            </label>

            <button className="primary wide" onClick={startRun} disabled={loading}>
              {loading ? "Working..." : "Start Agent Run"}
            </button>
          </section>
        </div>

        <section className="card">
          <div className="section-heading">
            <div>
              <span className="step">03</span>
              <h3>Run</h3>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => refreshRun()} disabled={!run}>
                Refresh Run
              </button>
              <button className="secondary" onClick={resumeRun} disabled={!run || loading}>
                Resume
              </button>
              <button className="primary" onClick={commitRun} disabled={!run || loading}>
                Commit
              </button>
            </div>
          </div>

          {!run ? (
            <div className="empty large">No run has been created yet.</div>
          ) : (
            <>
              <div className="run-grid">
                <div>
                  <span>Run ID</span>
                  <strong>{run.id}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{run.status || "created"}</strong>
                </div>
                <div>
                  <span>Role</span>
                  <strong>{run.role_name || run.role || role}</strong>
                </div>
                <div>
                  <span>Documents</span>
                  <strong>{selected.length}</strong>
                </div>
              </div>

              <div className="proposal-header">
                <h4>Proposal Queue</h4>
                <span>{visibleProposals.length} proposals</span>
              </div>

              <div className="proposal-list">
                {visibleProposals.length === 0 ? (
                  <div className="empty">No proposals returned by this run.</div>
                ) : (
                  visibleProposals.map((proposal, index) => {
                    const proposalId = proposal.id ?? proposal.proposal_id;
                    const decision = proposal.decision || proposal.status;

                    return (
                      <div className="proposal" key={proposalId ?? index}>
                        <div className="proposal-number">{index + 1}</div>
                        <div className="proposal-body">
                          <strong>
                            {proposal.title ||
                              proposal.name ||
                              `Proposal ${proposalId ?? index + 1}`}
                          </strong>
                          <p>
                            {proposal.description ||
                              proposal.reason ||
                              proposal.message ||
                              "Review this proposed action."}
                          </p>
                          <div className="proposal-meta">
                            {proposal.document_id && (
                              <span>Document: {proposal.document_id}</span>
                            )}
                            {decision && <span>Status: {decision}</span>}
                          </div>
                        </div>
                        <div className="decision-actions">
                          <button
                            className="approve"
                            onClick={() => decideProposal(proposalId, "approved")}
                            disabled={!proposalId || loading}
                          >
                            Approve
                          </button>
                          <button
                            className="reject"
                            onClick={() => decideProposal(proposalId, "rejected")}
                            disabled={!proposalId || loading}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>

        <section className="card onboarding">
          <div>
            <span className="step">04</span>
            <h3>Build Onboarding Kit</h3>
            <p>
              Create a role-specific procedure kit using the current analyst
              configuration.
            </p>
          </div>
          <button className="primary" onClick={buildKit} disabled={loading}>
            Build Kit
          </button>
        </section>

        <footer>
          <span>DocTask</span>
          <span>Human-gated workflow</span>
          <span>React + FastAPI + SQLite</span>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
