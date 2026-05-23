// src/cli.ts
import fs from 'fs';
import path from 'path';

// ANSI terminal color escape codes for high-taste developer feedback
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

/**
 * ⚡ INGESTION PATH: Sends raw files to the background thread pool
 */
async function sendFileToEngine(filePath: string) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`${RED}${BOLD}✕ Target log file not found at:${RESET} ${absolutePath}`);
    return;
  }

  const lines = fs.readFileSync(absolutePath, 'utf-8')
    .split('\n')
    .filter(l => l.trim().length > 0);

  console.log(`\n${BOLD}Reading ${lines.length} lines from file.${RESET} Dispatching payload to API ingestion gateway...`);

  const payload = {
    logs: lines.map(line => ({ content: line }))
  };

  try {
    const response = await fetch('http://localhost:3000/api/v1/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (response.ok) {
      console.log(`\n${GREEN}${BOLD}--- Real-Time Synthesis Complete ---${RESET}`);
      if (data.pm_insights && data.pm_insights.length > 0) {
        data.pm_insights.forEach((insight: string, idx: number) => {
          console.log(`\n${CYAN}${BOLD}Insight #${idx + 1}:${RESET} "${insight}"`);
        });
        console.log(`\n${GREEN}Flushed all corresponding vector clusters natively to ClickHouse warehouse.${RESET}\n`);
      } else {
        console.log(`\n${YELLOW}Telemetry parsed completely, but DBSCAN classified your lines as loose background noise. 0 high-density clusters formed.${RESET}\n`);
      }
    } else {
      console.error(`\n${RED}${BOLD}Engine rejected batch payload:${RESET}`, data);
    }
  } catch (err) {
    console.error(`\n${RED}${BOLD}Failed communicating with local container gateway process:${RESET}`, err);
  }
}

/**
 *  ANALYTICS PATH: Reads historical aggregated blocks directly from ClickHouse via Fastify
 */
async function fetchHistoricalAnalytics() {
  console.log(`\n ${BOLD}Querying Columnar Analytics Store...${RESET}`);
  try {
    const response = await fetch('http://localhost:3000/api/v1/analytics/topics');
    const payload = await response.json() as any;

    if (!response.ok || payload.status !== 'success') {
      console.error(`${RED}Failed to query server analytical endpoint.${RESET}`, payload);
      return;
    }

    const { meta, data } = payload;
    console.log(`\n${GREEN}${BOLD}--- Aggregated Historical Telemetry Summary ---${RESET}`);
    console.log(`  • Clusters Tracked : ${meta.total_clusters}`);
    console.log(`  • Extracted Traces : ${meta.total_logs_processed}`);
    console.log(`  • Snapshot Sync    : ${meta.generated_at}`);
    console.log(`${GREEN}${BOLD}--------------------------------------------------${RESET}`);

    if (data.length === 0) {
      console.log(`\n  ${YELLOW}Storage pools are currently dry. Stream logs first!${RESET}\n`);
      return;
    }

    data.forEach((topic: any, idx: number) => {
      console.log(`\n${YELLOW}${BOLD}[TOPIC PROFILE #${idx + 1}]${RESET}`);
      console.log(`  ${BOLD}Headline Identification :${RESET} ${CYAN}${topic.synthesis.headline_label}${RESET}`);
      console.log(`  ${BOLD}Anomalous Trace Weight  :${RESET} ${topic.metadata.impact_weight_size} occurrences`);
      console.log(`  ${BOLD}Operational Timeline    :${RESET} ${topic.metadata.detected_at}`);
      console.log(`  ${BOLD}Product Manager Insight :${RESET} "${topic.synthesis.product_manager_insight}"`);
      console.log(`  ${BOLD}Raw Log Evidential Core :${RESET}`);
      topic.evidence.slice(0, 2).forEach((sample: string) => {
        console.log(`    ↳ \x1b[90m${sample}\x1b[0m`);
      });
      if (topic.evidence.length > 2) {
        console.log(`    ↳ \x1b[90m... and ${topic.evidence.length - 2} more matching traces contextually stored in column${RESET}`);
      }
    });
    console.log(`\n${GREEN}${BOLD}--------------------------------------------------${RESET}\n`);

  } catch (err) {
    console.error(`\n${RED}${BOLD} Connection dropped while querying analytics gateway:${RESET}`, err);
  }
}

// --- CLI ENTRYPOINT MATCHING ENGINE INTERFACE ---
const args = process.argv.slice(2);

if (args[0] === '/input' && args[1]) {
  sendFileToEngine(args[1]);
} else if (args[0] === '/analytics') {
  fetchHistoricalAnalytics();
} else {
  console.log(`\n${BOLD}Log Synthesis Engine CLI Utility v1.0.0${RESET}`);
  console.log(`\n${BOLD}Usage Options:${RESET}`);
  console.log(`  npx ts-node src/cli.ts /input <path_to_log_file.log>     ${GREEN}Stream a telemetry dataset${RESET}`);
  console.log(`  npx ts-node src/cli.ts /analytics                       ${CYAN}Fetch pretty-printed ClickHouse insights${RESET}\n`);
}