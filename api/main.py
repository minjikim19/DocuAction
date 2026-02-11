import os
import json
from io import BytesIO
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, status, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from pydantic import BaseModel
from pypdf import PdfReader
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

vector_stores: dict[str, FAISS] = {}


class SearchRequest(BaseModel):
    doc_id: str
    query: str
    k: int = 3


class AutomateRequest(BaseModel):
    doc_id: str
    doc_type: Literal["meeting_notes", "resume", "jd", "policy", "random"]


def extract_pdf_text(content: bytes) -> tuple[int, str]:
    reader = PdfReader(BytesIO(content))
    page_texts: list[str] = []

    for page in reader.pages:
        page_texts.append(page.extract_text() or "")

    full_text = "\n\n".join(page_texts)
    return len(reader.pages), full_text


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/hello-pdf")
async def hello_pdf(file: UploadFile | None = File(default=None)):
    if file is None:
        return JSONResponse(status_code=400, content={"error": "file is required"})

    try:
        content = await file.read()
        pages, full_text = extract_pdf_text(content)
        return {
            "filename": file.filename or "",
            "pages": pages,
            "text_chars": len(full_text),
            "preview": full_text[:300],
        }
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid pdf"})


@app.post("/index-pdf")
async def index_pdf(file: UploadFile | None = File(default=None)):
    if file is None:
        return JSONResponse(status_code=400, content={"error": "file is required"})

    try:
        content = await file.read()
        _, full_text = extract_pdf_text(content)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid pdf"})

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    chunks = splitter.split_text(full_text)
    doc_id = str(uuid4())

    if not chunks:
        return {"doc_id": doc_id, "chunks": 0}

    if not os.getenv("OPENAI_API_KEY"):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "OPENAI_API_KEY is not set"},
        )

    embeddings = OpenAIEmbeddings()
    vector_stores[doc_id] = FAISS.from_texts(chunks, embedding=embeddings)
    return {"doc_id": doc_id, "chunks": len(chunks)}


@app.post("/search")
async def search(request: SearchRequest):
    vector_store = vector_stores.get(request.doc_id)
    if vector_store is None:
        return JSONResponse(status_code=400, content={"error": "no document indexed"})

    k = request.k if request.k > 0 else 3
    docs = vector_store.similarity_search(request.query, k=k)

    results = [
        {"rank": index + 1, "text": doc.page_content}
        for index, doc in enumerate(docs)
    ]

    return {"query": request.query, "k": k, "results": results}


@app.post("/automate")
async def automate(request: AutomateRequest):
    if not os.getenv("OPENAI_API_KEY"):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "OPENAI_API_KEY is not set"},
        )

    vector_store = vector_stores.get(request.doc_id)
    if vector_store is None:
        return JSONResponse(status_code=400, content={"error": "no document indexed"})

    summary_query = "summarize the document"
    actions_query = "action items, deadlines, owners"
    schedule_query = "events, dates, times"
    email_query = "email draft and next steps"

    summary_docs = vector_store.similarity_search(summary_query, k=3)
    actions_docs = vector_store.similarity_search(actions_query, k=3)
    schedule_docs = vector_store.similarity_search(schedule_query, k=3)
    email_docs = vector_store.similarity_search(email_query, k=3)

    def clamp(text: str, limit: int = 1200) -> str:
        t = (text or "").strip()
        return t[:limit]

    summary_sources = [clamp(doc.page_content) for doc in summary_docs]
    actions_sources = [clamp(doc.page_content) for doc in actions_docs]
    schedule_sources = [clamp(doc.page_content) for doc in schedule_docs]
    email_sources = [clamp(doc.page_content) for doc in email_docs]

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a strict JSON generator. Return only valid JSON with no markdown. "
                    "Use exactly this shape: "
                    "{\"summary\":\"...\",\"action_items\":[{\"task\":\"...\",\"owner\":\"...\",\"deadline\":\"...\","
                    "\"priority\":\"low|medium|high\",\"sources\":[\"...\"]}],"
                    "\"schedule_draft\":[{\"title\":\"...\",\"time\":\"...\",\"description\":\"...\",\"sources\":[\"...\"]}],"
                    "\"email_draft\":{\"subject\":\"...\",\"body\":\"...\",\"sources\":[\"...\"]}}. "
                    "For each section, sources must come from the provided section-specific retrieved chunks."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"doc_type: {request.doc_type}\n\n"
                    f"summary_sources:\n{json.dumps(summary_sources)}\n\n"
                    f"action_items_sources:\n{json.dumps(actions_sources)}\n\n"
                    f"schedule_sources:\n{json.dumps(schedule_sources)}\n\n"
                    f"email_sources:\n{json.dumps(email_sources)}\n"
                ),
            },
        ],
    )

    content = completion.choices[0].message.content or ""
    try:
        parsed = json.loads(content)
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "model_output_invalid"},
        )

    return parsed

# Debug endpoint to check if OPENAI_API_KEY is set, but do NOT return the key itself
@app.get("/debug/env")
async def debug_env() -> dict[str, bool]:
    # Do NOT return the key itself
    return {"has_openai_api_key": bool(os.getenv("OPENAI_API_KEY"))}
