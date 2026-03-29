"""
tests/core/test_repositories.py — Unit tests for Repositories.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, patch

from core.repositories.session_repository import SessionRepository
from core.repositories.message_repository import MessageRepository
from core.repositories.config_repository import ConfigRepository
from ingestion.repositories.ingestion_repository import IngestionRepository

@pytest.mark.asyncio
@patch("core.repositories.session_repository.get_connection")
async def test_session_repo_create(mock_get_conn):
    mock_conn = AsyncMock()
    mock_get_conn.return_value.__aenter__.return_value = mock_conn
    
    # Mocking return value of fetchrow
    session_id = uuid.uuid4()
    biz_id = uuid.uuid4()
    mock_conn.fetchrow.return_value = {
        "id": session_id,
        "business_id": biz_id,
        "channel": "web",
        "user_identifier": "user1",
        "status": "active",
        "conversation_summary": None,
        "created_at": None,
        "updated_at": None,
        "ended_at": None
    }
    
    repo = SessionRepository("tenant_test")
    session = await repo.create("web", "user1")
    
    assert session.id == session_id
    mock_conn.fetchrow.assert_called()


@pytest.mark.asyncio
@patch("core.repositories.config_repository.get_connection")
async def test_config_repo_system_settings(mock_get_conn):
    mock_conn = AsyncMock()
    mock_get_conn.return_value.__aenter__.return_value = mock_conn
    
    mock_conn.fetch.return_value = [
        {"key": "default_llm", "value": "sarvam"},
        {"key": "fallback_llm", "value": "groq"}
    ]
    
    repo = ConfigRepository()
    settings = await repo.get_system_settings()
    
    assert settings["default_llm"] == "sarvam"
    assert settings["fallback_llm"] == "groq"


@pytest.mark.asyncio
@patch("core.repositories.message_repository.get_connection")
async def test_message_repo_get_history(mock_get_conn):
    mock_conn = AsyncMock()
    mock_get_conn.return_value.__aenter__.return_value = mock_conn
    
    session_id = uuid.uuid4()
    mock_conn.fetch.return_value = [
        {"id": uuid.uuid4(), "session_id": session_id, "role": "user", "content": "hi", "is_unknown": False, "rag_context": None, "created_on": None},
        {"id": uuid.uuid4(), "session_id": session_id, "role": "assistant", "content": "hello", "is_unknown": False, "rag_context": None, "created_on": None}
    ]
    
    repo = MessageRepository("tenant_test")
    history = await repo.get_history(session_id)
    
    assert len(history) == 2
    # Check chronological reversal (repo uses reversed on results)
    assert history[0].role == "assistant" # reversed order from DB descending
    assert history[1].role == "user"


@pytest.mark.asyncio
@patch("ingestion.repositories.ingestion_repository.get_connection")
async def test_ingestion_repo_get_job(mock_get_conn):
    mock_conn = AsyncMock()
    mock_get_conn.return_value.__aenter__.return_value = mock_conn
    
    job_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    biz_id = uuid.uuid4()
    
    mock_conn.fetchrow.side_effect = [
        {"id": job_id, "trigger_document_id": doc_id, "status": "initiated", "document_ids": [], "error_message": None, "chunks_processed": 0, "started_at": None, "completed_at": None},
        {"id": doc_id, "filename": "test.pdf", "file_type": "pdf", "storage_path": "s3://path"},
        {"id": biz_id}
    ]
    
    repo = IngestionRepository("tenant_test")
    job, doc, bid = await repo.get_job_and_document(job_id)
    
    assert job.id == job_id
    assert doc.id == doc_id
    assert bid == biz_id
