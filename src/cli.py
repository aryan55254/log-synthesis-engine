import json
import os
import sys
import requests
from pathlib import Path

# ANSI terminal color escape codes for high-taste developer feedback
RESET = '\x1b[0m'
CYAN = '\x1b[36m'
GREEN = '\x1b[32m'
YELLOW = '\x1b[33m'
RED = '\x1b[31m'
BOLD = '\x1b[1m'


def send_file_to_engine(file_path: str):
    """⚡ INGESTION PATH: Sends raw files to the background thread pool"""
    absolute_path = os.path.abspath(file_path)

    if not os.path.exists(absolute_path):
        print(f"{RED}{BOLD}✕ Target log file not found at:{RESET} {absolute_path}")
        return

    with open(absolute_path, 'r') as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]

    print(f"\n{BOLD}Reading {len(lines)} lines from file.{RESET} Dispatching payload to API ingestion gateway...")

    payload = {
        'logs': [{'content': line} for line in lines]
    }

    try:
        response = requests.post(
            'http://localhost:3000/api/v1/logs',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )

        data = response.json()

        if response.status_code in [200, 201]:
            print(f"\n{GREEN}{BOLD}--- Real-Time Synthesis Complete ---{RESET}")
            if data.get('pm_insights') and len(data['pm_insights']) > 0:
                for idx, insight in enumerate(data['pm_insights'], 1):
                    print(f"\n{CYAN}{BOLD}Insight #{idx}:{RESET} \"{insight}\"")
                print(f"\n{GREEN}Flushed all corresponding vector clusters natively to ClickHouse warehouse.{RESET}\n")
            else:
                print(f"{YELLOW}{BOLD}No insights generated.{RESET}\n")
        else:
            print(f"\n{RED}{BOLD}✕ Engine rejected the payload:{RESET}")
            print(f"  Status Code: {response.status_code}")
            print(f"  Response: {data.get('detail', data.get('error', 'Unknown error'))}\n")

    except requests.exceptions.ConnectionError:
        print(f"\n{RED}{BOLD}✕ Unable to reach API at http://localhost:3000{RESET}")
        print(f"{YELLOW}Is the engine running? Try: docker-compose up{RESET}\n")
    except Exception as error:
        print(f"\n{RED}{BOLD}✕ Request failed:{RESET} {error}\n")


def main():
    if len(sys.argv) < 2:
        print(f"{BOLD}Log Synthesis Engine CLI{RESET}")
        print(f"\nUsage: python -m src.cli <path-to-logfile>\n")
        print(f"Example:")
        print(f"  python -m src.cli ./sample.log\n")
        sys.exit(1)

    log_file = sys.argv[1]
    send_file_to_engine(log_file)


if __name__ == '__main__':
    main()
