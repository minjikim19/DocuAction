import os
from io import BytesIO

from fastapi import FastAPI, File, status, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from pydantic import BaseModel
from pypdf import PdfReader
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

vector_store: FAISS | None = None


class SearchRequest(BaseModel):
    query: str
    k: int = 3


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
    global vector_store

    if file is None:
        return JSONResponse(status_code=400, content={"error": "file is required"})

    try:
        content = await file.read()
        _, full_text = extract_pdf_text(content)
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid pdf"})

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    chunks = splitter.split_text(full_text)

    if not chunks:
        vector_store = None
        return {"chunks": 0}

    if not os.getenv("OPENAI_API_KEY"):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": "OPENAI_API_KEY is not set"},
        )

    embeddings = OpenAIEmbeddings()
    vector_store = FAISS.from_texts(chunks, embedding=embeddings)
    return {"chunks": len(chunks), "indexed": True}


@app.post("/search")
async def search(request: SearchRequest):
    if vector_store is None:
        return JSONResponse(status_code=400, content={"error": "no document indexed"})

    k = request.k if request.k > 0 else 3
    docs = vector_store.similarity_search(request.query, k=k)

    results = [
        {"rank": index + 1, "text": doc.page_content}
        for index, doc in enumerate(docs)
    ]

    return {"query": request.query, "k": k, "results": results}

# Debug endpoint to check if OPENAI_API_KEY is set, but do NOT return the key itself
@app.get("/debug/env")
async def debug_env() -> dict[str, bool]:
    # Do NOT return the key itself
    return {"has_openai_api_key": bool(os.getenv("OPENAI_API_KEY"))}

