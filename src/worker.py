import threading
import asyncio
from typing import List, Callable, Optional
from pipeline import execute_log_pipeline


class ProcessingJob:
    """Structural contract tracking our held network requests in memory"""
    def __init__(self, job_id: str, lines: List[str]):
        self.job_id = job_id
        self.lines = lines
        self.resolve: Optional[Callable] = None
        self.reject: Optional[Callable] = None
        self.task: Optional[asyncio.Task] = None


class LogWorker:
    """Concurrent Queue Processing Engine using asyncio"""
    def __init__(self, max_concurrent: int = 3):
        self.local_worker_queue: List[ProcessingJob] = []
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        self.worker_thread = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.max_concurrent = max_concurrent
        self.active_tasks: set = set()

    def start(self):
        """Start the worker thread with asyncio event loop"""
        self.worker_thread = threading.Thread(target=self._run_worker_loop, daemon=True)
        self.worker_thread.start()

    def stop(self):
        """Stop the worker thread"""
        self.stop_event.set()
        if self.loop:
            # Schedule the coroutine to stop the event loop
            asyncio.run_coroutine_threadsafe(self._shutdown(), self.loop)
        if self.worker_thread:
            self.worker_thread.join(timeout=10)

    async def _shutdown(self):
        """Shutdown all active tasks"""
        if self.active_tasks:
            await asyncio.gather(*self.active_tasks, return_exceptions=True)

    def enqueue_job(self, job_id: str, lines: List[str], resolve: Callable, reject: Callable):
        """Add a job to the queue"""
        with self.lock:
            job = ProcessingJob(job_id, lines)
            job.resolve = resolve
            job.reject = reject
            self.local_worker_queue.append(job)
            print(f"[Queue Engine] Enqueued Job [{job_id}] ({len(lines)} lines). Queue Depth: {len(self.local_worker_queue)}")
        
        # Submit to asyncio loop if available
        if self.loop and not self.stop_event.is_set():
            asyncio.run_coroutine_threadsafe(self._process_queue_async(), self.loop)

    def _run_worker_loop(self):
        """Main worker loop with asyncio event loop"""
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        try:
            self.loop.run_until_complete(self._async_worker())
        finally:
            self.loop.close()

    async def _async_worker(self):
        """Async worker that drains the queue concurrently"""
        while not self.stop_event.is_set():
            await self._process_queue_async()
            await asyncio.sleep(0.1)  # Check queue every 100ms

    async def _process_queue_async(self):
        """Process jobs concurrently up to max_concurrent limit"""
        while len(self.active_tasks) < self.max_concurrent:
            current_job = None
            
            with self.lock:
                if len(self.local_worker_queue) == 0:
                    break
                current_job = self.local_worker_queue.pop(0)
            
            if not current_job:
                break
            
            print(f"[Worker Thread] Executing isolated memory pipeline for Job [{current_job.job_id}]")
            task = asyncio.create_task(self._run_job_async(current_job))
            self.active_tasks.add(task)
            task.add_done_callback(lambda t: self.active_tasks.discard(t))

    async def _run_job_async(self, current_job: ProcessingJob):
        """Execute a job asynchronously"""
        try:
            # Run our direct, purely volatile in-memory vector pipeline and clickhouse flush
            insights = await execute_log_pipeline(current_job.lines)

            # Notify completion
            if current_job.resolve:
                current_job.resolve(insights)

        except Exception as error:
            print(f"Thread engine failure while processing Job [{current_job.job_id}]: {error}")
            if current_job.reject:
                current_job.reject(error)
