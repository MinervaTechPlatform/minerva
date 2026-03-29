"""
core/api/auth.py — B2B authentication endpoints.
"""

import time
import jwt
import os
import uuid
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends
from shared.db.connection import get_connection
from shared.utils.logging import get_logger

logger = get_logger("core.api.auth")
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

JWT_SECRET = os.environ.get("JWT_SECRET", "minerva-dev-secret-key-must-be-at-least-32-bytes-long")
JWT_ALGORITHM = "HS256"


class AuthRequest(BaseModel):
    api_key: str
    user_identifier: str  # The client-side user ID (e.g. email/phone)
    channel: str = "web"


class AuthResponse(BaseModel):
    token: str
    business_id: str
    expires_in: int


@router.post("/token", response_model=AuthResponse)
async def exchange_token(req: AuthRequest):
    """
    Exchange a public api_key for a scoped JWT session token.
    
    1. Look up business_id by api_key in public schema.
    2. Verify api_key is active.
    3. Generate JWT containing business_id and schema_name.
    """
    # Note: In a real system, we'd check allowed_domains/IPs here.
    
    async with get_connection() as conn:
        # Resolve business by API key
        # (Assuming businesses table has a column or there's a join to api_keys)
        # For simplicity, we'll assume a direct lookup in a join.
        query = """
        SELECT b.id as business_id, b.schema_name, b.is_active
        FROM public.businesses b
        JOIN public.api_keys ak ON ak.business_id = b.id
        WHERE ak.api_key = $1 AND ak.is_active = true
        """
        biz = await conn.fetchrow(query, req.api_key)

    if not biz or not biz["is_active"]:
        logger.warning(f"Failed auth attempt with api_key: {req.api_key}")
        raise HTTPException(status_code=401, detail="Invalid or inactive API key")

    # Generate JWT
    expires_in = 3600 * 2  # 2 hours
    payload = {
        "sub": req.user_identifier,
        "business_id": str(biz["business_id"]),
        "schema": biz["schema_name"],
        "channel": req.channel,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_in
    }

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    logger.info(f"Auth: Issued token for business {biz['business_id']}, user {req.user_identifier}")
    
    return AuthResponse(
        token=token,
        business_id=str(biz["business_id"]),
        expires_in=expires_in
    )
