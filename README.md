# DocTask — Complete Docker Project

This version replaces the broken `frontend/src/main.jsx` with a clean React implementation and includes a matching FastAPI + SQLite backend.

## Project structure

```text
Abhishek_DockProject/
├── backend/
│   ├── Dockerfile
│   ├── db.py
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       └── style.css
├── docker-compose.yml
└── README.md
```

## Run without Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Run with Docker

From the project root:

```bash
docker compose up --build
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:8000
```

API docs:

```text
http://localhost:8000/docs
```

## Important

Do not merge the old broken `main.jsx` with this one. Replace the entire file with the supplied `frontend/src/main.jsx`.
