export default function HomePage() {
  return (
    <main className="container">
      <h1>DocuAction</h1>

      <div className="uploadCard">
        <label htmlFor="pdfFile">Upload PDF</label>
        <input id="pdfFile" type="file" accept="application/pdf" />
        <button type="button">Upload</button>
      </div>
    </main>
  );
}
