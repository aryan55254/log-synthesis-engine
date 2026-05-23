// src/pipeline.ts
import crypto from 'crypto';
import { clickhouse } from './db';
import { generateLogEmbedding, queryPMInsight } from './geminiService';
import dbscan from 'density-clustering'; 

/**
 * Runs the fully in-memory vector-clustering-analytics pipeline
 */
export async function executeLogPipeline(lines: string[]): Promise<string[]> {
  const dataset: number[][] = [];
  const insightsReturned: string[] = [];

  console.log(`Crunching vectors for ${lines.length} logs in-memory...`);

  // VECTORIZE 
  for (const line of lines) {
    const vector = await generateLogEmbedding(line);
    dataset.push(vector);
  }

  //  SPATIAL DENSITY MATRIX CLUSTERING 
  const dbscanEngine = new dbscan.DBSCAN();
  
  const epsilon = 0.4;
  const minPts = 2;
  
  const clusters: number[][] = dbscanEngine.run(dataset, epsilon, minPts);
  console.log(`Clustering Complete. Found ${clusters.length} high-density operational patterns.`);

  // CLUSTER-BY-CLUSTER AI SYNTHESIS & CLICKHOUSE PERSISTENCE 
  for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
    const points = clusters[cIdx];
    const clusterLogs = points.map(idx => lines[idx]);

    console.log(`Requesting Gemini Analysis for Cluster Group [${cIdx}] containing ${points.length} traces...`);
    
    // Pass up to 5 samples from the in-memory array straight to Gemini 2.5 Flash
    const analysis = await queryPMInsight(clusterLogs.slice(0, 5));
    insightsReturned.push(analysis.pm_insight);

    const topicId = crypto.randomUUID();

    //  BULK STREAM DIRECTLY TO CLICKHOUSE ---
    await clickhouse.insert({
      table: 'analytical_topics',
      values: [{
        topic_id: topicId,
        cluster_id: cIdx,
        label: analysis.label,
        pm_insight: analysis.pm_insight,
        sample_size: points.length,
        raw_log_samples: clusterLogs,
        created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') // YYYY-MM-DD HH:MM:SS
      }],
      format: 'JSONEachRow'
    });
  }

  console.log(` Pipeline pass executed successfully. Flushed analytics to ClickHouse warehouse.`);
  return insightsReturned;
}