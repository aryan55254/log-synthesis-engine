import uuid
import asyncio
from typing import List
from sklearn.cluster import DBSCAN
import numpy as np
from datetime import datetime
from db import clickhouse
from gemini_service import generate_log_embedding, query_pm_insight


async def execute_log_pipeline(lines: List[str]) -> List[str]:
    """Runs the fully in-memory vector-clustering-analytics pipeline"""
    dataset = []
    insights_returned = []

    print(f"Crunching vectors for {len(lines)} logs in-memory...")

    # VECTORIZE
    for line in lines:
        vector = generate_log_embedding(line)
        dataset.append(vector)
        # Yield control to allow other jobs to process
        await asyncio.sleep(0)

    # SPATIAL DENSITY MATRIX CLUSTERING
    dataset_array = np.array(dataset)
    
    epsilon = 0.4
    min_pts = 2
    
    dbscan = DBSCAN(eps=epsilon, min_samples=min_pts)
    labels = dbscan.fit_predict(dataset_array)
    
    # Group points by cluster
    clusters = []
    unique_labels = set(labels)
    for label in unique_labels:
        if label != -1:  # -1 is noise in DBSCAN
            cluster_indices = np.where(labels == label)[0]
            clusters.append(cluster_indices.tolist())
    
    print(f"Clustering Complete. Found {len(clusters)} high-density operational patterns.")

    # CLUSTER-BY-CLUSTER AI SYNTHESIS & CLICKHOUSE PERSISTENCE
    for cIdx, points in enumerate(clusters):
        cluster_logs = [lines[idx] for idx in points]

        print(f"Requesting Gemini Analysis for Cluster Group [{cIdx}] containing {len(points)} traces...")
        
        # Pass up to 5 samples from the in-memory array straight to Gemini
        analysis = query_pm_insight(cluster_logs[:5])
        insights_returned.append(analysis['pm_insight'])

        topic_id = str(uuid.uuid4())

        # BULK STREAM DIRECTLY TO CLICKHOUSE
        created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        try:
            clickhouse.execute(
                """
                INSERT INTO analytical_topics 
                (topic_id, cluster_id, label, pm_insight, sample_size, raw_log_samples, created_at)
                VALUES
                """,
                [(
                    topic_id,
                    cIdx,
                    analysis.get('label', 'Unknown'),
                    analysis.get('pm_insight', ''),
                    len(points),
                    cluster_logs,
                    created_at
                )]
            )
        except Exception as error:
            print(f"ClickHouse insert failed for cluster {cIdx}: {error}")
            # Continue processing other clusters even if one fails
        
        # Yield control to allow other jobs to process
        await asyncio.sleep(0)

    print("Pipeline pass executed successfully. Flushed analytics to ClickHouse warehouse.")
    return insights_returned
