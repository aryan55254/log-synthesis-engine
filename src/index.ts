// src/index.ts
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Worker } from 'worker_threads';
import path from 'path';
import crypto from 'crypto';
import { initDb, runClickHouseQuery } from './db';

const fastify: FastifyInstance = Fastify({ logger: false });

interface IngestLogBody {
  logs: Array<{ content: string }>;
}

// Structural contract tracking our held network requests in memory
export interface ProcessingJob {
  jobId: string;
  lines: string[];
  resolve: (insights: string[]) => void;
  reject: (err: Error) => void;
}

interface ClickHouseTopicRow {
  topic_id: string;
  cluster_id: number;
  label: string;
  pm_insight: string;
  sample_size: number;
  raw_log_samples: string[];
  created_at: string;
}

// Global Main-Thread Job Registry (Stores promise callbacks, NOT shared with worker heap)
export const jobQueue: ProcessingJob[] = [];

const workerPath = path.resolve(__dirname, './worker.js');
let persistentWorker: Worker | null = null;

/**
 * ⚡ FAST INGESTION PATH: Converts raw payloads into tracked jobs and passes data over the wire
 */
fastify.post('/api/v1/logs', async (request: FastifyRequest<{ Body: IngestLogBody }>, reply: FastifyReply) => {
  const { logs } = request.body;
  if (!logs || !Array.isArray(logs) || logs.length === 0) {
    return reply.status(400).send({ error: 'Payload must contain a valid logs array.' });
  }

  const lines = logs.map(l => l.content);
  const jobId = crypto.randomUUID();

  try {
    // Hold the connection open while the persistent background worker drains this job
    const insights = await new Promise<string[]>((resolve, reject) => {
      // 1. Store the tracking callbacks locally on the main thread stack
      jobQueue.push({ jobId, lines, resolve, reject });
      console.log(`[Queue Engine] Enqueued Job [${jobId}] (${lines.length} lines). Queue Depth: ${jobQueue.length}`);

      // 2. Pass the data payload explicitly down through the postMessage boundary channel
      if (persistentWorker) {
        persistentWorker.postMessage({
          type: 'START_JOB',
          jobId,
          lines
        });
      }
    });

    // Return the freshly minted PM insights straight back down the open HTTP socket
    return reply.status(201).send({
      status: 'success',
      pm_insights: insights
    });

  } catch (err: any) {
    console.error(`Core Ingestion Failure for Job [${jobId}]:`, err);
    return reply.status(500).send({
      status: 'error',
      error: err?.message || 'Background processing execution pipeline failed.'
    });
  }
});

/**
 * ANALYTICAL HISTORY PATH: Read instantly from ClickHouse Columnar Blocks
 */
fastify.get('/api/v1/analytics/topics', async (request, reply) => {
  try {
    const sql = `
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
    `;

    const rows = await runClickHouseQuery(sql) as ClickHouseTopicRow[];

    // Compute quick operational rollup metrics on the fly
    const totalClustersDiscovered = rows.length;
    const totalTracesAnalyzed = rows.reduce((sum, row) => sum + Number(row.sample_size), 0);

    // Return a highly structured, enterprise-grade telemetry payload
    return reply.status(200).send({
      status: 'success',
      meta: {
        total_clusters: totalClustersDiscovered,
        total_logs_processed: totalTracesAnalyzed,
        generated_at: new Date().toISOString()
      },
      data: rows.map(row => ({
        id: row.topic_id,
        metadata: {
          cluster_sequence_id: Number(row.cluster_id),
          detected_at: row.created_at,
          impact_weight_size: Number(row.sample_size)
        },
        synthesis: {
          headline_label: row.label,
          product_manager_insight: row.pm_insight
        },
        evidence: row.raw_log_samples
      }))
    });

  } catch (err: any) {
    console.error('ClickHouse analytical query failure:', err);
    return reply.status(500).send({
      status: 'error',
      error: 'Failed to extract structured analytical matrix from storage layer.'
    });
  }
});

fastify.get('/health', async () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    workerPool: {
      active: true,
      queueDepth: jobQueue.length
    }
  };
});

const start = async () => {
  try {
    await initDb();
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('API Gateway spinning on http://localhost:3000');

    // Instantiate your single long-running worker thread pool daemon
    persistentWorker = new Worker(workerPath);
    console.log('Persistent In-Memory Background Thread pool initialized.');

    // LISTEN FOR WORKER COMPLETION MESSAGES
    persistentWorker.on('message', (message: { status: string; jobId: string; insights?: string[]; error?: string }) => {
      // Locate the suspended promise callbacks inside the main thread registry map
      const jobIdx = jobQueue.findIndex(j => j.jobId === message.jobId);
      if (jobIdx === -1) return;

      const matchedJob = jobQueue[jobIdx];

      if (message.status === 'success' && message.insights) {
        matchedJob.resolve(message.insights);
      } else {
        matchedJob.reject(new Error(message.error || 'Internal pipeline processing fault.'));
      }

      // Evict the completed job profile out of main thread footprint allocation
      jobQueue.splice(jobIdx, 1);
    });

    persistentWorker.on('error', (err) => {
      console.error('CRITICAL: Background Worker Thread died unexpectedly:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('Gateway Initialization Fault:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}