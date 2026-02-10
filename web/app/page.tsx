"use client";

import { useState } from "react";

type HelloPdfSuccess = {
  filename: string;
  pages: number;
  text_chars: number;
  preview: string;
};

type HelloPdfError = {
  error: string;
};

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [result, setResult] = useState<HelloPdfSuccess | null>(null);

  const handleUpload = async () => {
    setErrorMessage("");
    setResult(null);

    if (!selectedFile) {
      setErrorMessage("Please select a PDF file.");
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      setErrorMessage("Please upload a valid PDF file.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("http://localhost:8000/hello-pdf", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | HelloPdfSuccess
        | HelloPdfError;

      if (!response.ok) {
        const errorPayload = payload as HelloPdfError;
        setErrorMessage(errorPayload.error || "Upload failed.");
        return;
      }

      setResult(payload as HelloPdfSuccess);
    } catch {
      setErrorMessage("Unable to reach backend.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="container">
      <h1>DocuAction</h1>

      <div className="uploadCard">
        <label htmlFor="pdfFile">Upload PDF</label>
        <input
          id="pdfFile"
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] ?? null);
            setErrorMessage("");
          }}
        />
        <button type="button" onClick={handleUpload} disabled={isUploading}>
          {isUploading ? "Uploading..." : "Upload"}
        </button>
        {errorMessage ? <p>{errorMessage}</p> : null}
      </div>

      {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
    </main>
  );
}
