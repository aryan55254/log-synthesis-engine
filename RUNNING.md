# Local Environment Runbook

This document describes the commands to provision, initialize, verify, and fully clean the Log Synthesis Engine local development environment.

---

## Prerequisites

- Docker & Docker Compose V2
- Python 3.11+
- A valid Gemini API token set in the repository root `.env`:

```env
# .env
GEMINI_API_KEY=your_gemini_api_key_here
```
> Note — check Docker files and host port bindings before bootstrapping
>
> Inspect docker-compose.yml and any Dockerfile for "ports:" mappings and ensure the host ports used by the services are not already bound on your machine. If a port is in use, either stop the process using it or update the compose mappings.

```bash
# Quick checks (update ports if your compose uses different ones)
# Inspect compose for explicit host bindings:
grep -nR "ports:" docker-compose.yml || true
# Check if common service ports are already listening on the host:
ss -ltnp | grep -E ':3000|:8123|:9000' || true
# Or with lsof:
sudo lsof -iTCP -sTCP:LISTEN -Pn | grep -E ':3000|:8123|:9000' || true
```
---

1) Bootstrapping the container grid

- Compile and start services (detached):

```bash
docker compose up -d --build

```

If any of these ports are reported as in use, stop the offending service or change the host port mappings in docker-compose.yml before running `docker compose up -d --build`.

- Confirm services and ports:

```bash
docker compose ps
# Expected: `log_engine` Up/Running on port 3000 and `log_engine_clickhouse` Healthy
```

2) Monitoring logs

- Tail service logs to observe initialization and telemetry:

```bash
docker compose logs -f engine
```

3) Verification (Python CLI in src/cli.py)

- Step A — Check gateway health:

```bash
python -m src.cli /health
```

- Step B — Ingest an operational log batch:

```bash
python -m src.cli /input agent_run.log  
```
- Or you can add your own log file in root of the engine :

```bash
python -m src.cli /input your_log_file.log  
```

- Step C — Query analytics/dashboard:

```bash
python -m src.cli /analytics
```

4) Full environment cleanup

- Stop all containers:

```bash
docker stop $(docker ps -a -q) 2>/dev/null || true
```

- Remove containers, images, and volumes (destructive):

```bash
docker system prune -a --volumes -f
docker volume prune -f
docker builder prune -a -f
```

Notes
- Use the `.env` in the repo root; do not commit secrets to version control.
- The cleanup commands are irreversible — use with caution.
- If TypeScript errors occur, ensure dependencies are installed: `npm install` or `pnpm install`.