from io import BytesIO

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pypdf import PdfReader

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/hello-pdf")
async def hello_pdf(file: UploadFile | None = File(default=None)):
    if file is None:
        return JSONResponse(status_code=400, content={"error": "file is required"})

    try:
        content = await file.read()
        reader = PdfReader(BytesIO(content))

        page_texts: list[str] = []
        for page in reader.pages:
            page_texts.append(page.extract_text() or "")

        full_text = "".join(page_texts)
        return {
            "filename": file.filename or "",
            "pages": len(reader.pages),
            "text_chars": len(full_text),
            "preview": full_text[:300],
        }
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid pdf"})
