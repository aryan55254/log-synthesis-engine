// src/worker.ts
import { parentPort as originalParentPort } from 'worker_threads';
import { executeLogPipeline } from './pipeline';

if (!originalParentPort) {
  console.error("This module must be executed within a worker thread context.");
  process.exit(1);
}

const parentPort = originalParentPort;
let isProcessing = false;

// Local isolated thread queue matrix tracking workloads passed across the message channel
const localWorkerQueue: Array<{ jobId: string; lines: string[] }> = [];

/**
 * Sequential Queue Draining Controller Loop
 */
async function processQueueNextTick() {
  // Guard clause: do nothing if the thread is busy or if the queue is exhausted
  if (isProcessing || localWorkerQueue.length === 0) return;

  isProcessing = true;
  
  // Pop exactly one structured job envelope off the local thread task array
  const currentJob = localWorkerQueue.shift()!;
  
  console.log(`[Worker Thread] Executing isolated memory pipeline for Job [${currentJob.jobId}]`);

  try {
    // Run our direct, purely volatile in-memory vector pipeline and clickhouse flush
    const insights = await executeLogPipeline(currentJob.lines);

    // Notify the main thread that the job completed successfully and pass metrics
    parentPort.postMessage({
      status: 'success',
      jobId: currentJob.jobId,
      insights
    });

  } catch (error: any) {
    console.error(`Thread engine failure while processing Job [${currentJob.jobId}]:`, error);
    
    parentPort.postMessage({
      status: 'error',
      jobId: currentJob.jobId,
      error: error?.message || 'Internal pipeline processing fault.'
    });
  } finally {
    isProcessing = false;
    
    // Automatically trigger immediate check for backlogged logs on the next cycle tick
    setImmediate(processQueueNextTick);
  }
}

// Reactively respond to direct data packages pushed into our stream wire handler
parentPort.on('message', (msg: { type: string; jobId: string; lines: string[] }) => {
  if (msg.type === 'START_JOB') {
    localWorkerQueue.push({ jobId: msg.jobId, lines: msg.lines });
    processQueueNextTick();
  }
});

// Run a safety interval heartbeat loop to capture any un-alerted processing elements
setInterval(processQueueNextTick, 1000);