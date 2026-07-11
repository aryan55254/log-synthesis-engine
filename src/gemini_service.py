import os
import json
from typing import Any
from dotenv import load_dotenv

load_dotenv()

import google.generativeai as genai

api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print("GEMINI_API_KEY not defined in this thread's environment variables.")

genai.configure(api_key=api_key)


def generate_log_embedding(log_content: str) -> list:
    """Turn text lines into mathematical vector dimensions"""
    try:
        response = genai.embed_content(
            model='models/embedding-001',
            content=log_content,
            task_type='RETRIEVAL_DOCUMENT'
        )
        if response.get('embedding'):
            return response['embedding']
        
        raise Exception('Malformed coordinate payload returned from Gemini endpoint.')
    except Exception as error:
        print(f'Gemini Embedding Layer Failure: {error}')
        raise error


def query_pm_insight(log_samples: list) -> dict:
    """Analyze a dense structural cluster and extract consumer business impacts"""
    try:
        prompt = f"""
You are analyzing a dense cluster group of identical system log failures.
Here are raw contextual samples of the error pattern:
{chr(10).join(log_samples)}

Examine the operational data and extract a non-technical summary.

Respond ONLY with valid JSON in this format:
{{
    "label": "Brief human-readable identifier for the anomaly. Max 5 words.",
    "pm_insight": "High-level business-impact sentence explicitly showing which user feature is broken."
}}
"""

        response = genai.generate_text(
            prompt=prompt,
            model='models/text-bison-001',
            temperature=0.1,
        )

        if response.result:
            try:
                # Try to parse as JSON
                return json.loads(response.result)
            except json.JSONDecodeError:
                # If JSON parsing fails, extract label and insight from text
                return {
                    'label': 'Analysis Complete',
                    'pm_insight': response.result
                }
        
        return {'label': 'Unknown Failure', 'pm_insight': 'Failed generating diagnostic data breakdown.'}
    except Exception as error:
        print(f'Gemini Reporting Layer Failure: {error}')
        return {'label': 'Unknown Failure', 'pm_insight': 'Failed generating diagnostic data breakdown.'}
