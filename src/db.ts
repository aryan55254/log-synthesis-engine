// src/db.ts
import { createClient } from '@clickhouse/client';
import dotenv from 'dotenv';

dotenv.config();

// Initialize the single ClickHouse connection client
export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'aryan_analytics',
  password: process.env.CLICKHOUSE_PASSWORD || 'analytics_password_99',
  database: process.env.CLICKHOUSE_DB || 'log_analytics_db',
});

/**
 * Bootstraps the analytical storage engine
 */
export async function initDb(): Promise<void> {
  try {
    await clickhouse.command({
      query: `
        CREATE TABLE IF NOT EXISTS analytical_topics (
          topic_id UUID,
          cluster_id Int32,
          label String,
          pm_insight String,
          sample_size UInt32,
          raw_log_samples Array(String), -- We save the sample raw log lines directly into an array column!
          created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        PRIMARY KEY (topic_id)
        ORDER BY (topic_id, created_at);
      `
    });
    console.log("ClickHouse pure OLAP engine tables initialized successfully.");
  } catch (error) {
    console.error("ClickHouse initialization layers failed to bootstrap:", error);
    throw error;
  }
}

/**
 * Helper to wrap SELECT queries
 */
export async function runClickHouseQuery(sql: string): Promise<any[]> {
  const resultSet = await clickhouse.query({
    query: sql,
    format: 'JSONEachRow',
  });
  return resultSet.json();
}