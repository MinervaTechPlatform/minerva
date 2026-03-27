"""
ingestion/main.py — ECS task entry point for the Ingestion service.
"""

import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv

# Load environment variables from .env file at the project root
load_dotenv()

from shared.db.connection import DBConnectionPool
from shared.utils.logging import get_logger

logger = get_logger("ingestion.main")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Minerva Ingestion ECS Task — processes a single document ingestion job."
    )
    parser.add_argument(
        "--job-id",
        dest="job_id",
        default=os.environ.get("INGESTION_JOB_ID"),
        help="UUID of the ingestion_jobs record to process.",
    )
    return parser.parse_args()


async def _run(job_id: str) -> int:
    """Async execution wrapper. Returns 0 on success, 1 on failure."""
    logger.info(f"Ingestion task started — job_id={job_id}")

    pool = DBConnectionPool.get_instance()
    await pool.initialize()

    from ingestion.services.ingestion_service import process_job

    try:
        success = await process_job(job_id)
        return 0 if success else 1
    finally:
        await pool.close()


def main() -> None:
    """CLI entry point."""
    args = _parse_args()

    if not args.job_id:
        logger.error("No job ID provided. Pass --job-id <uuid> or set INGESTION_JOB_ID.")
        sys.exit(2)

    exit_code = asyncio.run(_run(args.job_id))
    logger.info(f"Ingestion task finished with exit code {exit_code}.")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
