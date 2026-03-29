"""
tests/core/test_api.py — Integration tests for Core API endpoints.
"""

import uuid
import pytest
import jwt
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock

from core.main import app
from core.middleware.auth_middleware import JWT_SECRET, JWT_ALGORITHM

client = TestClient(app)

@pytest.fixture
def valid_token(business_id):
    payload = {
        "sub": "test-user",
        "business_id": str(business_id),
        "schema": "tenant_test",
        "exp": 9999999999
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def test_health_check():
    # Bypass auth for health check
    response = client.get("/internal/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_exchange_token_success(mock_db_connection, business_id):
    # Mock DB response for API key lookup
    mock_db_connection.fetchrow.return_value = {
        "business_id": business_id,
        "schema_name": "tenant_test",
        "is_active": True
    }
    
    payload = {
        "api_key": "test_key",
        "user_identifier": "user@example.com"
    }
    
    # After refactor, API uses repositories but repositories still use get_connection internally
    # However core.api.auth.get_token still calls get_connection directly for API key lookup
    with patch("core.api.auth.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__aenter__.return_value = mock_db_connection
        response = client.post("/api/v1/auth/token", json=payload)
    
    assert response.status_code == 200
    data = response.json()
    assert "token" in data


def test_auth_middleware_missing_token():
    response = client.post("/api/v1/sessions/", json={})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_session_success(valid_token, mock_db_connection, business_id):
    # Setup
    session_id = uuid.uuid4()
    
    headers = {"Authorization": f"Bearer {valid_token}"}
    
    # After refactor, services use SessionRepository which uses get_connection internally.
    # The clean way is to mock the SessionRepository.create method.
    with patch("core.services.session_service.SessionRepository.create") as mock_create:
        mock_create.return_value = MagicMock(id=session_id, status="active")
        
        response = client.post("/api/v1/sessions/", headers=headers)
    
    assert response.status_code == 200
    assert response.json()["session_id"] == str(session_id)
