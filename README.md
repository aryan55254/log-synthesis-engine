# Log Synthesis Engine

A high-performance, agentic conversational log processing pipeline designed to ingest unstructured system log streams, compute dense vector embeddings, and run spatial density matrix clustering generating real-time product management (PM) insights before committing analytics to an OLAP data warehouse.

Built with **FastAPI** (Python) for optimal concurrency, **ClickHouse** for columnar analytics, and **Gemini AI** for intelligent log analysis.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Framework** | FastAPI (Python 3.11+) |
| **Concurrency** | asyncio with background worker threads |
| **Vectorization** | Google Gemini Embedding API |
| **Clustering** | scikit-learn DBSCAN (density-based spatial clustering) |
| **Data Warehouse** | ClickHouse (OLAP columnar database) |
| **Container** | Docker Compose |

---

## Architecture

### Request Flow

1. **Log Ingestion** (`POST /api/v1/logs`) — FastAPI server accepts raw log batches
2. **Queue Management** — Jobs enqueued to background worker pool (up to 3 concurrent)
3. **Vector Pipeline** — Each log line embedded using Gemini API
4. **DBSCAN Clustering** — In-memory density-based clustering groups similar error patterns
5. **AI Analysis** — Gemini analyzes each cluster, extracts business-impact insights
6. **ClickHouse Persistence** — Cluster metadata + insights flushed to columnar warehouse
7. **Analytics Retrieval** (`GET /api/v1/analytics/topics`) — Query insights from ClickHouse

### Concurrency Model

- **AsyncIO Pipeline** — Vectorization and clustering run as async coroutines, yielding control for interleaved processing
- **Worker Thread Pool** — Background thread runs asyncio event loop managing up to 3 concurrent jobs
- **Non-blocking I/O** — Gemini API calls and ClickHouse inserts don't block the main FastAPI thread

---

## Deep-Dive Specifications

To evaluate the complete engineering trade-offs, algorithm justifications, and distributed scalability roadmaps, review the detailed deep-dive sub-manifests:

* [**REASONING.md**](./REASONING.md) — High-taste analysis on choosing Columnar OLAP (ClickHouse) over transactional pgvector, picking density-spatial clustering (DBSCAN) over pre-calculated $K$-Means, and managing thread-boundary allocations.
* [**RUNNING.md**](./RUNNING.md) — Step-by-step developer environment runbook covering local Docker Compose container definitions, network initialization steps, and the native Python CLI utility toolkit.

---

## Engine Result & Running Screenshots 

### PM Insights Result

![PM Insights Result](./public/image2.png)

### Engine Running Logs

![Engine Running Logs](./public/image3.png)
