"""
core/middleware/auth_middleware.py — JWT authentication and tenant routing.

Purpose:
    Intersects every request to:
    1. Validate the JWT token.
    2. Extract tenant identity (business_id, schema_name).
    3. Inject identity into request context for the DB connection pool.
    4. Implement sliding window token refresh.
"""

import time
import jwt
import os
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from shared.utils.logging import get_logger

logger = get_logger("core.middleware.auth")

JWT_SECRET = os.environ.get("JWT_SECRET", "minerva-dev-secret-key-must-be-at-least-32-bytes-long")
JWT_ALGORITHM = "HS256"


from fastapi.responses import JSONResponse

class AuthMiddleware(BaseHTTPMiddleware):
    """validates JWT and sets tenant context."""

    async def dispatch(self, request: Request, call_next):
        # 1. Skip auth for public endpoints
        if request.url.path.startswith("/api/v1/auth") or \
           request.url.path.startswith("/internal/health") or \
           request.method == "OPTIONS":
            return await call_next(request)

        # 2. Extract Token
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"}
            )

        token = auth_header.split(" ")[1]

        try:
            # 3. Decode and Validate
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            
            # Injection into request state for easy access in routers
            request.state.business_id = payload.get("business_id")
            request.state.schema_name = payload.get("schema")
            request.state.user_identifier = payload.get("sub")
            
            # 4. Check expiration
            if payload.get("exp", 0) < time.time():
                 return JSONResponse(status_code=401, content={"detail": "Token expired"})


        except jwt.ExpiredSignatureError:
            return JSONResponse(status_code=401, content={"detail": "Session expired"})
        except jwt.InvalidTokenError as exc:
            logger.warning(f"Invalid token attempt: {exc}")
            return JSONResponse(status_code=401, content={"detail": "Invalid session token"})
        except Exception as exc:
            logger.error(f"Auth middleware token parsing error: {exc}", exc_info=True)
            return JSONResponse(status_code=500, content={"detail": "Authentication validation error"})

        response = await call_next(request)
        return response

