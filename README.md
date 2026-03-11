# DocuAction

DocuAction is an AI-powered document analysis system designed to help users extract actionable insights from unstructured documents.

The project focuses on building a practical Retrieval-Augmented Generation (RAG) workflow that improves response grounding, traceability, and document understanding using modern LLM tooling.

---

## Overview

Large language models often struggle with hallucination when answering questions about long documents.  
DocuAction addresses this by combining:

- Document ingestion and chunking
- Vector-based semantic search
- Retrieval-Augmented Generation (RAG)
- Multi-step reasoning workflows

This allows the system to generate responses that are grounded in the original documents rather than relying solely on model knowledge.

---

## Key Features

### Document Processing Pipeline
- Upload and process unstructured documents
- Automatically split documents into semantic chunks
- Store embeddings for efficient retrieval

### Vector-Based Semantic Search
- Retrieve relevant document segments based on user queries
- Use similarity search to locate supporting evidence

### Multi-step RAG Workflow
- Retrieve relevant context from the vector store
- Provide grounded responses using LLM reasoning
- Improve response traceability by linking answers to source documents

### LLM-Orchestrated Document QA
- Enables question-answering over large document collections
- Reduces hallucination by grounding outputs in retrieved context

---

## Architecture
```
User Query
│
▼
Semantic Retrieval (Vector Search)
│
▼
Relevant Document Chunks
│
▼
LLM Reasoning (RAG Prompt)
│
▼
Grounded Response + Source Context
```

The system separates **retrieval, reasoning, and response generation**, allowing more reliable document understanding.

---

## Tech Stack

- **Python**
- **FastAPI**
- **LangChain**
- **Vector Embeddings / Semantic Search**
- **LLM-based reasoning**
- **Retrieval-Augmented Generation (RAG)**

---

## Why This Project

Working with LLM systems highlighted a common challenge:  
models can generate confident but incorrect answers when working with large documents.

DocuAction was built to explore practical approaches to:

- improving grounding in LLM outputs
- building reliable document QA pipelines
- structuring multi-step reasoning workflows for LLM applications

The project focuses on **practical system design rather than just prompt experimentation**, emphasizing reproducible pipelines and clear retrieval logic.

---

## Future Improvements

Planned improvements include:

- Document highlighting and citation tracing
- Evaluation pipelines for hallucination detection
- Multi-agent orchestration for document analysis
- UI for interactive document exploration

---

## Repository

GitHub:  
https://github.com/minjikim19/DocuAction

---

## Author

**Minji Kim**  
AI / Data Systems Developer

Portfolio: https://minjikim19.github.io  
LinkedIn: https://linkedin.com/in/minji-kim19
