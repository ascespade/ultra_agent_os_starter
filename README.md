# Ultra Agent OS - Core Backend & Dashboard

This repository contains the Ultra Agent OS core services:
- **API:** REST API for managing jobs, memory, and adapters.
- **Worker:** Background worker for processing job queues.
- **UI:** Professional Operations Dashboard.
- **Postgres:** Database for memory and state.
- **Redis:** Cache and job queue backend.

## 🚀 Quick Start (Local)

**Prerequisites:** Docker and Docker Compose.

1.  **Clone and Start:**
    ```bash
    docker compose up -d
    ```

2.  **Access Services:**
    - **Dashboard:** [http://localhost:3003](http://localhost:3003)
    - **API:** [http://localhost:3000](http://localhost:3000)

## ☁️ Deployment (Railway)

This project is configured for seamless deployment on Railway.

1.  **Connect Repository:** Connect this repo to Railway.
2.  **Variables:** Ensure `.env.railway` variables are set in the Railway project settings (Postgres/Redis variables are auto-injected if you add those plugins).
3.  **Deploy:** Pushing to `main` triggers deployment.

## 📁 Project Structure

- `apps/api`: Node.js Express API service.
- `apps/worker`: Job processing worker.
- `apps/ui`: Operations Dashboard (HTML/JS + Express).
- `lib`: Shared utility libraries.

## 🛠️ Management Scripts

We provide helper scripts to ensure stability:

- **Verify Production (Local):** Clean build & health check in production mode.
  ```bash
  ./scripts/verify-production.sh
  ```
- **Safe Deploy:** Verifies locally before pushing.
  ```bash
  ./scripts/deploy.sh
  ```

## 🛠️ Docker Commands

- **Clean & Reset:** `docker compose down -v` (Wipes DB)
- **Logs:** `docker compose logs -f`
