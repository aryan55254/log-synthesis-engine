import uuid
import threading
import time
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from worker import LogWorker
from db import init_db, run_clickhouse_query

# Initialize FastAPI app
app = FastAPI()

# Initialize worker
worker = LogWorker()


class LogEntry(BaseModel):
    content: str


class IngestLogBody(BaseModel):
    logs: List[LogEntry]


class ProcessingResult:
    """Holds the result of a processing job"""
    def __init__(self):
        self.result = None
        self.error = None
        self.done = threading.Event()


# Global registry to track processing jobs
job_results = {}
job_results_lock = threading.Lock()


@app.on_event("startup")
async def startup_event():
    """Initialize database and start worker on startup"""
    try:
        init_db()
        worker.start()
        print("Application initialized successfully.")
    except Exception as error:
        print(f"Startup failed: {error}")
        raise error


@app.on_event("shutdown")
async def shutdown_event():
    """Stop worker on shutdown"""
    worker.stop()


@app.post('/api/v1/logs')
async def ingest_logs(request: IngestLogBody):
    """⚡ FAST INGESTION PATH: Converts raw payloads into tracked jobs and passes data over the wire"""
    if not request.logs or len(request.logs) == 0:
        raise HTTPException(status_code=400, detail='Payload must contain a valid logs array.')

    lines = [log.content for log in request.logs]
    job_id = str(uuid.uuid4())

    try:
        # Create a result holder for this job
        result = ProcessingResult()

        def resolve_callback(insights):
            result.result = insights
            result.done.set()

        def reject_callback(error):
            result.error = error
            result.done.set()

        # Enqueue job in worker
        worker.enqueue_job(job_id, lines, resolve_callback, reject_callback)

        print(f"[Queue Engine] Job [{job_id}] enqueued. Waiting for processing...")

        # Wait for the job to complete (max 5 minutes timeout)
        if not result.done.wait(timeout=300):
            raise HTTPException(status_code=504, detail='Processing timeout.')

        # Check if there was an error
        if result.error:
            raise HTTPException(status_code=500, detail=str(result.error))

        insights = result.result or []

        # Return the freshly minted PM insights straight back down the open HTTP socket
        return JSONResponse(
            status_code=201,
            content={
                'status': 'success',
                'pm_insights': insights
            }
        )

    except HTTPException:
        raise
    except Exception as error:
        print(f"Core Ingestion Failure for Job [{job_id}]: {error}")
        raise HTTPException(status_code=500, detail=str(error))


@app.get('/api/v1/analytics/topics')
async def get_analytics_topics():
    """ANALYTICAL HISTORY PATH: Read instantly from ClickHouse Columnar Blocks"""
    try:
        sql = """
            SELECT 
                topic_id,
                cluster_id, 
                label, 
                pm_insight, 
                sample_size, 
                raw_log_samples, 
                created_at 
            FROM analytical_topics 
            ORDER BY created_at DESC, sample_size DESC 
            LIMIT 100
        """
        
        results = run_clickhouse_query(sql)
        
        # Convert results to list of dicts
        topics = []
        for row in results:
            topics.append({
                'topic_id': str(row[0]) if len(row) > 0 else '',
                'cluster_id': row[1] if len(row) > 1 else 0,
                'label': row[2] if len(row) > 2 else '',
                'pm_insight': row[3] if len(row) > 3 else '',
                'sample_size': row[4] if len(row) > 4 else 0,
                'raw_log_samples': row[5] if len(row) > 5 else [],
                'created_at': str(row[6]) if len(row) > 6 else ''
            })

        return JSONResponse(
            status_code=200,
            content={
                'status': 'success',
                'topics': topics,
                'count': len(topics)
            }
        )

    except Exception as error:
        print(f"Analytics Query Failure: {error}")
        raise HTTPException(status_code=500, detail='Failed to retrieve analytics.')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=3000)
