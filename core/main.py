"""
core/main.py — Core Service entry point.

Purpose:
    Initializes the FastAPI application, registers routers,
    attaches middleware, and manages the lifecycle of shared
    Singletons (DB pool, ConfigCache).
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file at the project root
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.api import auth, sessions, internal
from core.middleware.auth_middleware import AuthMiddleware
from shared.db.connection import DBConnectionPool
from shared.config.config_cache import ConfigCache
from shared.utils.logging import get_logger

logger = get_logger("core.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown of app-level singletons."""
    logger.info("Core Service starting up...")
    
    # 1. Initialize Database Pool
    pool = DBConnectionPool.get_instance()
    await pool.initialize()
    
    # 2. Initialize ConfigCache (loads data and starts background refresh)
    cache = ConfigCache.get_instance()
    await cache.initialize()
    
    yield
    
    # 3. Shutdown
    logger.info("Core Service shutting down...")
    await cache.shutdown()
    await pool.close()


def create_app() -> FastAPI:
    """FastAPI Application Factory."""
    app = FastAPI(
        title="Minerva Core",
        description="Conversation Runtime for Minerva Voice AI",
        version="1.0.0",
        lifespan=lifespan
    )

    # ── Middleware ────────────────────────────────────────────────────────────

    # CORS for Dashboard/Web client
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restricted in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Custom Auth Middleware for tenant routing
    app.add_middleware(AuthMiddleware)

    # ── Routers ───────────────────────────────────────────────────────────────

    app.include_router(auth.router)
    app.include_router(sessions.router)
    app.include_router(internal.router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("core.main:app", host="0.0.0.0", port=port, reload=True)
