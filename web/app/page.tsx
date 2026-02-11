"use client";

import { useState } from "react";

type ApiError = {
  error?: string;
};

type IndexPdfResponse = {
  doc_id: string;
  chunks: number;
};

type AutomateResponse = {
  summary: string;
  action_items: Array<{
    task: string;
    owner: string;
    deadline: string;
    priority: "low" | "medium" | "high";
    sources: string[];
  }>;
  schedule_draft: Array<{
    title: string;
    time: string;
    description: string;
    sources: string[];
  }>;
  email_draft: {
    subject: string;
    body: string;
    sources: string[];
  };
};

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function priorityClass(priority: "low" | "medium" | "high"): string {
  return `badge badge-${priority}`;
}

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docId, setDocId] = useState<string>("");
  const [chunks, setChunks] = useState<number | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [automateResult, setAutomateResult] = useState<AutomateResponse | null>(null);

  const handleIndexPdf = async () => {
    setErrorMessage("");
    setDocId("");
    setChunks(null);
    setAutomateResult(null);

    if (!selectedFile) {
      setErrorMessage("Please select a PDF file first.");
      return;
    }

    setIsIndexing(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("http://localhost:8000/index-pdf", {
        method: "POST",
        body: formData,
      });

      const payload = (await readJsonSafe(response)) as IndexPdfResponse | ApiError | null;

      if (!response.ok) {
        setErrorMessage(payload && "error" in payload && payload.error ? payload.error : "Failed to index PDF.");
        return;
      }

      const data = payload as IndexPdfResponse;
      setDocId(data.doc_id);
      setChunks(data.chunks);
    } catch {
      setErrorMessage("Backend is unreachable. Make sure FastAPI is running on port 8000.");
    } finally {
      setIsIndexing(false);
    }
  };

  const handleGenerateActions = async () => {
    setErrorMessage("");

    if (!docId) {
      setErrorMessage("Please index a PDF before generating actions.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("http://localhost:8000/automate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doc_id: docId,
          doc_type: "random",
        }),
      });

      const payload = (await readJsonSafe(response)) as AutomateResponse | ApiError | null;

      if (!response.ok) {
        setErrorMessage(payload && "error" in payload && payload.error ? payload.error : "Failed to generate actions.");
        return;
      }

      setAutomateResult(payload as AutomateResponse);
    } catch {
      setErrorMessage("Backend is unreachable. Make sure FastAPI is running on port 8000.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="container">
      <h1>DocuAction</h1>

      <section className="uploadCard">
        <label htmlFor="pdfFile">Upload PDF</label>
        <input
          id="pdfFile"
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setSelectedFile(file);
            setDocId("");
            setChunks(null);
            setAutomateResult(null);
            setErrorMessage("");
          }}
        />

        <div className="buttonRow">
          <button
            type="button"
            onClick={handleIndexPdf}
            disabled={!selectedFile || isIndexing}
          >
            {isIndexing ? "Indexing..." : "Index PDF"}
          </button>

          <button
            type="button"
            onClick={handleGenerateActions}
            disabled={!docId || isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate Actions"}
          </button>
        </div>

        <div className="statusGrid">
          <p><span>Selected file</span><strong>{selectedFile ? selectedFile.name : "None"}</strong></p>
          <p><span>Doc ID</span><strong>{docId || "Not indexed"}</strong></p>
          <p><span>Chunks</span><strong>{chunks ?? "-"}</strong></p>
          <p><span>Status</span><strong>{isIndexing ? "Indexing..." : isGenerating ? "Generating..." : "Idle"}</strong></p>
        </div>

        {errorMessage ? <p className="errorMessage">{errorMessage}</p> : null}
      </section>

      {automateResult ? (
        <section className="resultsWrap">
          <header className="resultsHeader">
            <h2>Generated Output</h2>
            <p>
              Action items: <strong>{automateResult.action_items.length}</strong> | Schedule items: <strong>{automateResult.schedule_draft.length}</strong>
            </p>
          </header>

          <section className="resultCard">
            <h3>Summary</h3>
            <p className="summaryText">{automateResult.summary}</p>
          </section>

          <section className="resultCard">
            <h3>Action Items</h3>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Task</th>
                    <th>Owner</th>
                    <th>Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {automateResult.action_items.map((item, index) => (
                    <tr key={`${item.task}-${index}`}>
                      <td><span className={priorityClass(item.priority)}>{item.priority}</span></td>
                      <td>{item.task}</td>
                      <td>{item.owner || "-"}</td>
                      <td>{item.deadline || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {automateResult.action_items.map((item, index) => (
              <details key={`action-sources-${index}`}>
                <summary>Sources for action item #{index + 1}</summary>
                <ul>
                  {item.sources?.map((source, sourceIndex) => (
                    <li key={`action-source-${index}-${sourceIndex}`}>{truncate(source)}</li>
                  ))}
                </ul>
              </details>
            ))}
          </section>

          <section className="resultCard">
            <h3>Schedule Draft</h3>
            <div className="scheduleList">
              {automateResult.schedule_draft.map((item, index) => (
                <article key={`${item.title}-${index}`} className="scheduleItem">
                  <p className="scheduleHead">
                    <strong>{item.title || "Untitled"}</strong>
                    <span>{item.time || "No time"}</span>
                  </p>
                  <p>{item.description}</p>
                  <details>
                    <summary>Sources</summary>
                    <ul>
                      {item.sources?.map((source, sourceIndex) => (
                        <li key={`schedule-source-${index}-${sourceIndex}`}>{truncate(source)}</li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
            </div>
          </section>

          <section className="resultCard">
            <h3>Email Draft</h3>
            <p>
              <strong>Subject:</strong> {automateResult.email_draft.subject}
            </p>
            <div className="emailBody">{automateResult.email_draft.body}</div>
            <details>
              <summary>Sources</summary>
              <ul>
                {automateResult.email_draft.sources?.map((source, index) => (
                  <li key={`email-source-${index}`}>{truncate(source)}</li>
                ))}
              </ul>
            </details>
          </section>
        </section>
      ) : null}
    </main>
  );
}
