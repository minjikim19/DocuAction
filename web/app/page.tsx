"use client";

import { useEffect, useRef, useState } from "react";

type ApiError = {
  error?: string;
};

type IndexPdfResponse = {
  doc_id: string;
  chunks: number;
};

type HelloPdfResponse = {
  preview?: string;
  full_text?: string;
  text?: string;
};

type ClientChunk = {
  id: number;
  text: string;
  norm: string;
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

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const MAX_CONTEXT_TEXT_LENGTH = 300_000;

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

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildClientChunks(text: string): ClientChunk[] {
  if (!text.trim()) return [];

  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  const chunks: ClientChunk[] = [];
  let start = 0;
  let id = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const originalSlice = text.slice(start, end).trim();

    if (originalSlice) {
      chunks.push({
        id,
        text: originalSlice,
        norm: normalizeText(originalSlice),
      });
      id += 1;
    }

    if (end >= text.length) break;
    start += step;
  }

  return chunks;
}

function computeMatchScore(sourceKey: string, chunkText: string): number {
  if (!sourceKey || !chunkText) {
    return 0;
  }

  let score = 0;
  if (chunkText.includes(sourceKey)) {
    score += 100;
  }

  const sourceWords = new Set(sourceKey.split(" ").filter(Boolean));
  const chunkWords = new Set(chunkText.split(" ").filter(Boolean));

  let shared = 0;
  for (const word of sourceWords) {
    if (chunkWords.has(word)) {
      shared += 1;
      if (shared >= 50) {
        break;
      }
    }
  }

  score += shared;

  const coverageRatio = Math.min(
    1,
    Math.max(0, sourceKey.length / Math.max(chunkText.length, 1))
  );
  if (coverageRatio > 0.6) {
    score += 20;
  } else if (coverageRatio > 0.4) {
    score += 10;
  }

  return score;
}

function findBestChunkId(sourceKey: string, chunks: ClientChunk[]): number {
  if (chunks.length === 0) {
    return 0;
  }

  if (!sourceKey) {
    return chunks[0].id;
  }

  let bestChunkId = chunks[0].id;
  let bestScore = 0;

  for (const chunk of chunks) {
    const score = computeMatchScore(sourceKey, chunk.norm);
    if (score > bestScore) {
      bestScore = score;
      bestChunkId = chunk.id;
    }
  }

  if (bestScore === 0) {
    return chunks[0].id;
  }

  return bestChunkId;
}

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docId, setDocId] = useState<string>("");
  const [chunks, setChunks] = useState<number | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [automateResult, setAutomateResult] = useState<AutomateResponse | null>(
    null,
  );
  const [extractedText, setExtractedText] = useState<string>("");
  const [clientChunks, setClientChunks] = useState<ClientChunk[]>([]);
  const [selectedChunkId, setSelectedChunkId] = useState<number | null>(null);
  const [highlightChunkId, setHighlightChunkId] = useState<number | null>(null);
  const [contextWarning, setContextWarning] = useState<string>("");
  const [showRawJson, setShowRawJson] = useState(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (automateResult && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [automateResult]);

  const resetContextState = () => {
    setDocId("");
    setChunks(null);
    setAutomateResult(null);
    setShowRawJson(false);
    setExtractedText("");
    setClientChunks([]);
    setSelectedChunkId(null);
    setHighlightChunkId(null);
    setContextWarning("");
  };

  const highlightAndScrollToChunk = (chunkId: number) => {
    setSelectedChunkId(chunkId);
    setHighlightChunkId(chunkId);

    const element = document.getElementById(`chunk-${chunkId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightChunkId(null);
    }, 2000);
  };

  const handleSourceClick = (source: string, detailsId?: string) => {
    if (clientChunks.length === 0) {
      if (extractedText.length > MAX_CONTEXT_TEXT_LENGTH) {
        setContextWarning(
          "This document is too large to render context chunks in the UI.",
        );
      } else {
        setContextWarning(
          "No local chunks available yet. Index the PDF again.",
        );
      }
      return;
    }

    const sourceKey = normalizeText(source).slice(0, 120);
    const matchedId = findBestChunkId(sourceKey, clientChunks);
    const matchedChunk = clientChunks.find((chunk) => chunk.id === matchedId);
    const matchScore = matchedChunk
      ? computeMatchScore(sourceKey, matchedChunk.norm)
      : 0;
    if (detailsId) {
      const details = document.getElementById(detailsId);
      if (details instanceof HTMLDetailsElement) {
        details.open = true;
      }
    }

    if (matchScore === 0) {
      setContextWarning(
        "Could not find an exact source match. Closest match shown instead.",
      );
    } else {
      setContextWarning("");
    }

    highlightAndScrollToChunk(matchedId);
  };

  const handleIndexPdf = async () => {
    setErrorMessage("");
    resetContextState();

    if (!selectedFile) {
      setErrorMessage("Please select a PDF file first.");
      return;
    }

    setIsIndexing(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const indexResponse = await fetch("http://localhost:8000/index-pdf", {
        method: "POST",
        body: formData,
      });

      const indexPayload = (await readJsonSafe(indexResponse)) as
        | IndexPdfResponse
        | ApiError
        | null;

      if (!indexResponse.ok) {
        setErrorMessage(
          indexPayload && "error" in indexPayload && indexPayload.error
            ? indexPayload.error
            : "Failed to index PDF.",
        );
        return;
      }

      const indexData = indexPayload as IndexPdfResponse;
      setDocId(indexData.doc_id);
      setChunks(indexData.chunks);

      const extractForm = new FormData();
      extractForm.append("file", selectedFile);

      const helloResponse = await fetch("http://localhost:8000/hello-pdf", {
        method: "POST",
        body: extractForm,
      });

      const helloPayload = (await readJsonSafe(helloResponse)) as
        | HelloPdfResponse
        | ApiError
        | null;

      if (!helloResponse.ok) {
        setContextWarning(
          helloPayload && "error" in helloPayload && helloPayload.error
            ? `Context extraction limited: ${helloPayload.error}`
            : "Context extraction limited.",
        );
        return;
      }

      const extracted = ((helloPayload as HelloPdfResponse).full_text ||
        (helloPayload as HelloPdfResponse).text ||
        (helloPayload as HelloPdfResponse).preview ||
        "") as string;

      setExtractedText(extracted);

      if (extracted.length > MAX_CONTEXT_TEXT_LENGTH) {
        setClientChunks([]);
        setContextWarning(
          "Document too large to render full context. Grounding still works, but context preview is limited.",
        );
        return;
      }

      setClientChunks(buildClientChunks(extracted));
    } catch {
      setErrorMessage(
        "Backend is unreachable. Make sure FastAPI is running on port 8000.",
      );
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

      const payload = (await readJsonSafe(response)) as
        | AutomateResponse
        | ApiError
        | null;

      if (!response.ok) {
        setErrorMessage(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Failed to generate actions.",
        );
        return;
      }

      setAutomateResult(payload as AutomateResponse);
    } catch {
      setErrorMessage(
        "Backend is unreachable. Make sure FastAPI is running on port 8000.",
      );
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
            resetContextState();
            setErrorMessage("");
          }}
        />

        <div className="buttonRow">
          <button
            type="button"
            onClick={handleIndexPdf}
            disabled={!selectedFile || isIndexing}
          >
            {isIndexing ? (
              <>
                <span className="btnSpinner" aria-hidden="true" />
                Indexing...
              </>
            ) : (
              "Index PDF"
            )}
          </button>

          <button
            type="button"
            onClick={handleGenerateActions}
            disabled={!docId || isGenerating}
          >
            {isGenerating ? (
              <>
                <span className="btnSpinner" aria-hidden="true" />
                Generating...
              </>
            ) : (
              "Generate Actions"
            )}
          </button>
        </div>

        <div className="statusGrid">
          <p>
            <span>Selected file</span>
            <strong>{selectedFile ? selectedFile.name : "None"}</strong>
          </p>
          <p>
            <span>Doc ID</span>
            <strong>{docId || "Not indexed"}</strong>
          </p>
          <p>
            <span>Chunks</span>
            <strong>{chunks ?? "-"}</strong>
          </p>
          <p>
            <span>Status</span>
            <strong>
              {isIndexing
                ? "Indexing..."
                : isGenerating
                  ? "Generating..."
                  : "Idle"}
            </strong>
          </p>
        </div>

        {errorMessage ? <p className="errorMessage">{errorMessage}</p> : null}
      </section>

      <section className="resultCard contextSection">
        <header className="contextHeader">
          <h3>Document Context</h3>
          {selectedChunkId !== null ? (
            <button
              type="button"
              className="jumpBtn"
              onClick={() => highlightAndScrollToChunk(selectedChunkId)}
            >
              Jump to highlighted chunk
            </button>
          ) : null}
        </header>

        {contextWarning ? (
          <p className="warningMessage">{contextWarning}</p>
        ) : null}

        <div className="contextScroll">
          {clientChunks.length > 0 ? (
            clientChunks.map((chunk) => (
              <article
                id={`chunk-${chunk.id}`}
                key={chunk.id}
                className={`chunkBlock ${highlightChunkId === chunk.id ? "chunkHighlight" : ""}`}
                onClick={() => highlightAndScrollToChunk(chunk.id)}
                style={{ cursor: "pointer" }}
              >
                <h4>Chunk #{chunk.id + 1}</h4>
                <pre>{chunk.text}</pre>
              </article>
            ))
          ) : (
            <p className="muted">
              {extractedText
                ? "Document loaded but no previewable chunks were found."
                : "Upload and index a PDF to explore document context."}
            </p>
          )}
        </div>
      </section>

      {isIndexing || isGenerating ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {isIndexing
            ? "Processing document..."
            : "Generating action items..."}
        </p>
      ) : null}

      {automateResult ? (
        <section className="resultsWrap" ref={resultsRef}>
          <header className="resultsHeader">
            <h2>Generated Output</h2>
            <p>
              Action items:{" "}
              <strong>{automateResult.action_items.length}</strong> | Schedule
              items: <strong>{automateResult.schedule_draft.length}</strong>
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
                      <td>
                        <span className={priorityClass(item.priority)}>
                          {item.priority}
                        </span>
                      </td>
                      <td>{item.task}</td>
                      <td>{item.owner || "-"}</td>
                      <td>{item.deadline || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {automateResult.action_items.map((item, index) => (
              <div className="sourcesBlock" key={`action-sources-${index}`}>
                <details id={`action-details-${index}`}>
                  <summary>Sources for action item #{index + 1}</summary>
                  <ul>
                    {item.sources?.map((source, sourceIndex) => (
                      <li key={`action-source-${index}-${sourceIndex}`}>
                        <button
                          type="button"
                          className="sourceLink"
                          onClick={() =>
                            handleSourceClick(source, `action-details-${index}`)
                          }
                        >
                          {truncate(source)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </section>

          <section className="resultCard">
            <h3>Schedule Draft</h3>
            <div className="scheduleList">
              {automateResult.schedule_draft.map((item, index) => (
                <article
                  key={`${item.title}-${index}`}
                  className="scheduleItem"
                >
                  <p className="scheduleHead">
                    <strong>{item.title || "Untitled"}</strong>
                    <span>{item.time || "No time"}</span>
                  </p>
                  <p>{item.description}</p>
                  <details id={`schedule-details-${index}`}>
                    <summary>Sources</summary>
                    <ul>
                      {item.sources?.map((source, sourceIndex) => (
                        <li key={`schedule-source-${index}-${sourceIndex}`}>
                          <button
                            type="button"
                            className="sourceLink"
                            onClick={() =>
                              handleSourceClick(
                                source,
                                `schedule-details-${index}`,
                              )
                            }
                          >
                            {truncate(source)}
                          </button>
                        </li>
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
            <details id="email-details">
              <summary>Sources</summary>
              <ul>
                {automateResult.email_draft.sources?.map((source, index) => (
                  <li key={`email-source-${index}`}>
                    <button
                      type="button"
                      className="sourceLink"
                      onClick={() => handleSourceClick(source, "email-details")}
                    >
                      {truncate(source)}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          <section className="resultCard">
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              style={{ marginBottom: showRawJson ? 10 : 0 }}
            >
              Show Raw JSON
            </button>
            {showRawJson ? (
              <pre>{JSON.stringify(automateResult, null, 2)}</pre>
            ) : null}
          </section>
        </section>
      ) : null}
      <style jsx>{`
        .btnSpinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(255, 255, 255, 0.5);
          border-top-color: #ffffff;
          border-radius: 50%;
          display: inline-block;
          margin-right: 8px;
          vertical-align: -2px;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}
