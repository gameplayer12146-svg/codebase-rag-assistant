# 🚀 Codebase RAG Assistant

> **AI-powered codebase intelligence for understanding, searching, and navigating large software repositories.**

Codebase RAG Assistant is an AI-powered **Retrieval-Augmented Generation (RAG)** system that helps developers understand unfamiliar and large codebases.

Instead of manually searching through thousands of lines of code, developers can provide a Git repository and ask questions such as:

* 🔐 Where is authentication handled?
* 🔑 Which function validates the password?
* 🗄️ Where is the database connection created?
* 🔄 What happens after login?
* 📁 Which files are responsible for user registration?

The system analyzes the repository, understands its code structure, retrieves the most relevant code, and generates an answer with **exact source references**.

---

## 🎯 Problem

Large software projects can contain thousands or even millions of lines of code.

New developers often struggle to quickly find:

* Authentication logic
* Database connections
* Login APIs
* Password validation
* Important functions and classes
* Dependencies between different parts of the application
* The flow of a particular feature

Traditional keyword search is often not enough because developers need to understand the **meaning and relationships within the code**.

---

## 💡 Our Solution

Codebase RAG Assistant combines:

**Code Parsing + Structural Chunking + Embeddings + Vector Search + LLM + Source References**

### Workflow

```text
Git Repository
      ↓
File Filtering
      ↓
Source Code Parsing
      ↓
Function / Class Extraction
      ↓
Structural Chunking
      ↓
Embedding Generation
      ↓
Vector Database
      ↓
User Question
      ↓
Semantic Retrieval
      ↓
Relevant Code
      ↓
LLM
      ↓
Answer + Source References
```

---

## ✨ Key Features

### 📦 Repository Ingestion

* GitHub repository URL support
* ZIP repository upload
* Automatic repository scanning

### 🔍 Intelligent Code Filtering

Automatically identifies relevant source files such as:

```text
.py
.js
.ts
.java
.c
.cpp
.go
```

Ignores unnecessary files such as:

```text
.git
node_modules
build
dist
generated files
binary files
temporary files
```

### 🧠 Code Understanding

The system structurally analyzes source code and identifies:

* Functions
* Classes
* Methods
* Modules
* Configuration sections

### ✂️ Intelligent Code Chunking

Instead of splitting code randomly, the system creates meaningful chunks based on the structure of the source code.

Example:

```text
File:
src/auth/login.py

Function:
login_user()

Lines:
42 - 87
```

### 🔢 Embeddings

Each meaningful code section is converted into an embedding so that the system can perform semantic similarity search.

### 🗃️ Vector Database

Relevant code embeddings are stored in a vector database for fast retrieval.

Currently designed to support:

* ChromaDB
* FAISS
* Qdrant
* Weaviate
* Pinecone

### 💬 AI Codebase Chat

Ask natural-language questions about your repository.

Example:

```text
Where is authentication handled?
```

The system retrieves relevant code and generates a grounded answer.

### 📍 Source References

Every answer can provide:

```text
File:
src/auth/login.py

Function:
login_user()

Lines:
42–87
```

Users can click the source and inspect the exact code.

### 🖥️ Developer-Friendly Interface

The frontend provides:

* Repository dashboard
* File explorer
* AI chat
* Retrieved context
* Source citations
* Code viewer
* Indexing progress
* Repository statistics

---

# 🏗️ Architecture

```text
                    ┌──────────────────────┐
                    │       Developer      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Next.js Frontend   │
                    │    Antigravity       │
                    └──────────┬───────────┘
                               │
                          REST API
                               │
                               ▼
                    ┌──────────────────────┐
                    │    FastAPI Backend   │
                    │        Kiro          │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
       Code Parser        Embeddings        Vector DB
       Tree-sitter        Embedding API      ChromaDB
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                        Relevant Code
                               │
                               ▼
                         LLM / RAG
                               │
                               ▼
                     Answer + Citations
```

---

# 🛠️ Tech Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Monaco Editor
* Lucide Icons

## Backend

* Python
* FastAPI
* Pydantic
* Tree-sitter / AST
* ChromaDB
* REST API

## AI / RAG

* Code embeddings
* Semantic search
* Vector retrieval
* Large Language Model
* Retrieval-Augmented Generation

---

# 📁 Project Structure

```text
codebase-rag-assistant/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── types/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── ingestion/
│   │   ├── parser/
│   │   ├── chunking/
│   │   ├── embeddings/
│   │   ├── vectorstore/
│   │   ├── retrieval/
│   │   ├── rag/
│   │   └── models/
│   │
│   ├── tests/
│   ├── requirements.txt
│   └── ...
│
├── README.md
└── .gitignore
```

---

# 🔌 API Flow

### Create Repository

```http
POST /api/repositories
```

### Upload Repository

```http
POST /api/repositories/upload
```

### Start Indexing

```http
POST /api/repositories/{id}/index
```

### Repository Information

```http
GET /api/repositories/{id}
```

### Get Files

```http
GET /api/repositories/{id}/files
```

### Ask AI

```http
POST /api/repositories/{id}/query
```

Example:

```json
{
  "question": "Where is authentication handled?"
}
```

Example response:

```json
{
  "answer": "Authentication is handled in the login module...",
  "sources": [
    {
      "file_path": "src/auth/login.py",
      "symbol_name": "login_user",
      "symbol_type": "function",
      "start_line": 42,
      "end_line": 87
    }
  ]
}
```

---

# 🚀 Getting Started

## 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/codebase-rag-assistant.git
cd codebase-rag-assistant
```

---

## 2. Start Backend

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate it on Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create your environment file:

```bash
cp .env.example .env
```

Start FastAPI:

```bash
uvicorn app.main:app --reload
```

Backend:

```text
http://localhost:8000
```

API documentation:

```text
http://localhost:8000/docs
```

---

## 3. Start Frontend

Open another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create:

```text
.env.local
```

Add:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:3000
```

---

# 🧪 Example Demo

### Step 1 — Add Repository

Provide a GitHub repository URL or upload a ZIP file.

### Step 2 — Scan Repository

The system scans the repository and identifies relevant source files.

### Step 3 — Understand Code

Source code is parsed into meaningful functions, classes and modules.

### Step 4 — Create Knowledge Base

Code chunks are embedded and stored in the vector database.

### Step 5 — Ask a Question

```text
Where is authentication handled?
```

### Step 6 — Retrieve Relevant Code

The RAG system finds the most relevant code sections.

### Step 7 — Generate Answer

The LLM generates a grounded explanation.

### Step 8 — View Source

The developer can open the exact file and code lines in the code viewer.

---

# 🎯 Example Questions

```text
Where is authentication handled?

Which function validates the password?

Where is the database connection created?

What happens after login?

Where is user registration implemented?

Which files handle JWT authentication?

How does the application communicate with the database?

Where are API routes defined?

Which class manages user authentication?

How does the login flow work?
```

---

# 🔐 Security Principles

The project is designed with security in mind.

* API keys stored in environment variables
* No hardcoded secrets
* Repository isolation
* No unnecessary file indexing
* Binary and generated files excluded
* Retrieved context used to ground AI responses
* No intentional hallucination of unavailable code
* Input validation
* Backend error handling
* CORS configuration

> **Never commit `.env` files, API keys, passwords, or private repository credentials to GitHub.**

---

# 📈 Future Improvements

* Multi-language code understanding
* Advanced code dependency graphs
* Call-graph visualization
* Hybrid keyword + vector search
* Reranking models
* Repository version tracking
* Git commit history analysis
* Pull-request analysis
* Bug detection
* Security vulnerability detection
* Automated code documentation
* Code explanation generation
* Multi-repository search
* Private enterprise repository support

---

# 🏆 Hackathon Value

Codebase RAG Assistant helps developers reduce the time required to understand unfamiliar software projects.

Instead of:

```text
Search → Open files → Read code → Follow functions → Search again
```

developers can use:

```text
Ask Question
     ↓
AI understands intent
     ↓
Retrieve relevant code
     ↓
Generate explanation
     ↓
Show exact source
```

This makes large codebases significantly easier to explore and understand.

---

# 👨‍💻 Development

### Frontend

**Antigravity**

Responsible for:

* UI/UX
* Repository dashboard
* AI chat
* File explorer
* Code viewer
* Source citation interface

### Backend

**Kiro**

Responsible for:

* Repository ingestion
* Code parsing
* Chunking
* Embeddings
* Vector database
* Retrieval
* RAG pipeline
* LLM integration
* APIs

The frontend and backend communicate through REST APIs.

---

# 📜 License

This project is developed for educational and hackathon purposes.

---

## ⭐ Built for Developers, Powered by AI

**Codebase RAG Assistant — Ask your codebase. Understand your code. Build faster.**
