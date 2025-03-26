# Celery x Redis - Task Queue

Showcase of Celery x Redis for Task Queue

## System Architecture

```mermaid
graph LR
    subgraph "Frontend (Next.js)"
        UI[User Interface]
    end

    subgraph "Backend (FastAPI)"
        API[API Server]
        Celery[Celery Worker]
    end

    subgraph "Redis"
        Queue[(Message Broker)]
        Results[(Result Backend)]
    end

    UI -->|HTTP Requests| API
    API -->|1\. Submit Task| Queue
    Queue -->|2\. Process Task| Celery
    Celery -->|3\. Store Result| Results
    API -->|4\. Get Result| Results
    API -->|5\. Return Result| UI

    style UI fill:#61DAFB
    style API fill:#009688
    style Celery fill:#A6D674
    style Queue fill:#DC382D
    style Results fill:#DC382D
```

## Getting Started

```bash
docker compose up
```

> ### Backend Setup
>
> ```bash
> uv install
> 
> cd backend
> docker compose up
> 
> # http://localhost:8000/
> # http://localhost:8000/docs
> ```
>
> ### Frontend Setup
>
> ```bash
> bun install
> 
> bun dev
> 
> # http://localhost:3000/
> ```

---

## Vibe Coding Guide

Add Documents (`Settings... > Cursor Settings > Features > Docs`):

- https://docs.celeryq.dev/en/stable/
- https://redis-py.readthedocs.io/en/stable/
- https://developer.mozilla.org/en-US/docs/Web
