"""
shared/db/connection.py — Database connection pool (Singleton).

Purpose:
    Manages the PostgreSQL connection pool shared across all requests
    within a single process.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import asyncpg

from shared.utils.logging import get_logger

logger = get_logger("shared.db.connection")


class DBConnectionPool:
    """
    Singleton manager for the asyncpg connection pool.
    """
    _instance: Optional[DBConnectionPool] = None

    def __init__(self) -> None:
        self._pool: Optional[asyncpg.Pool] = None
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> DBConnectionPool:
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def initialize(self) -> None:
        """Initialize the pool if it doesn't exist."""
        if self._pool is not None:
            return

        async with self._lock:
            if self._pool is not None:
                return

            dsn = self._build_dsn()
            min_size = int(os.getenv("DB_POOL_MIN_SIZE", "2"))
            max_size = int(os.getenv("DB_POOL_MAX_SIZE", "10"))

            logger.info(
                "Initialising database connection pool",
                extra={"min_size": min_size, "max_size": max_size},
            )

            try:
                self._pool = await asyncpg.create_pool(
                    dsn=dsn,
                    min_size=min_size,
                    max_size=max_size,
                    command_timeout=30,
                )
                logger.info("Database connection pool ready.")
            except Exception as e:
                logger.error(f"Failed to create database pool: {e}")
                raise

    async def get_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            await self.initialize()
        return self._pool

    def is_initialized(self) -> bool:
        return self._pool is not None

    async def close(self) -> None:
        """Close the pool gracefully."""
        if self._pool:
            await self._pool.close()
            self._pool = None
            logger.info("Database connection pool closed.")

    def _build_dsn(self) -> str:
        """Construct the PostgreSQL DSN from environment variables."""
        # Preference 1: DATABASE_URL
        if "DATABASE_URL" in os.environ:
            return os.environ["DATABASE_URL"]

        # Preference 2: Individual variables
        try:
            host = os.environ["DB_HOST"]
            port = os.getenv("DB_PORT", "5432")
            name = os.environ["DB_NAME"]
            user = os.environ["DB_USER"]
            password = os.environ["DB_PASSWORD"]
            return f"postgresql://{user}:{password}@{host}:{port}/{name}"
        except KeyError as e:
            logger.error(f"Missing environment variable: {e}")
            raise


@asynccontextmanager
async def get_connection(tenant_schema: str | None = None) -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Helper function for backward compatibility and ease of use.
    """
    pool_mgr = DBConnectionPool.get_instance()
    pool = await pool_mgr.get_pool()
    
    async with pool.acquire() as conn:
        if tenant_schema:
            # Simple validation for schema name
            if not tenant_schema.isidentifier():
                 # We allow dots for schema.table but usually it's just 'tenant_name'
                 pass
            await conn.execute(f'SET search_path TO "{tenant_schema}", public')
        try:
            yield conn
        finally:
            await conn.execute("SET search_path TO public")
