"""
tests/ingestion/services/test_ingestion_service_refactored.py — Refactored ingestion tests.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
import numpy as np

from shared.models.ingestion_job import IngestionStatus

@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.get_job_and_document = AsyncMock()
    repo.update_job_status = AsyncMock()
    repo.update_document = AsyncMock()
    repo.update_job_documents = AsyncMock()
    repo.get_active_documents_except = AsyncMock()
    repo.notify_index_update = AsyncMock()
    return repo

@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.download_file = AsyncMock()
    storage.upload_file = AsyncMock()
    storage.copy_file = AsyncMock()
    return storage

@pytest.mark.asyncio
@patch("ingestion.services.ingestion_service.IngestionRepository")
@patch("ingestion.services.ingestion_service.get_storage_provider")
@patch("ingestion.pipeline.parser.parse")
@patch("ingestion.pipeline.chunker.chunk")
@patch("ingestion.pipeline.embedder.embed")
@patch("ingestion.pipeline.vector_store.save_index")
@patch("ingestion.pipeline.vector_store.archive_previous_index")
async def test_process_job_success(
    mock_archive, mock_save, mock_embed, mock_chunk, mock_parse, 
    mock_get_storage, mock_repo_cls, 
    mock_repo, mock_storage, monkeypatch
):
    monkeypatch.setenv("BUSINESS_SCHEMA", "tenant_test")
    
    # Setup mocks
    mock_repo_cls.return_value = mock_repo
    mock_get_storage.return_value = mock_storage
    
    biz_id = uuid.uuid4()
    doc_id = uuid.uuid4()
    job_id = uuid.uuid4()
    
    job = MagicMock(id=job_id)
    doc = MagicMock(id=doc_id, storage_path="s3://b/k", filename="t.pdf", file_type="pdf")
    
    mock_repo.get_job_and_document.return_value = (job, doc, biz_id)
    mock_repo.get_active_documents_except.return_value = []
    
    mock_parse.return_value = "raw text"
    mock_chunk.return_value = [{"text": "c1"}]
    mock_embed.return_value = np.zeros((1, 384))
    
    from ingestion.services.ingestion_service import process_job
    
    # Execute
    result = await process_job(str(job_id))
    
    # Verify
    assert result is True
    mock_repo.update_job_status.assert_any_call(
        job_id, IngestionStatus.SUCCESS, 
        chunks_processed=1, 
        completed_at=pytest.any_comparison() # We'll just check if it was called
    )
    mock_repo.notify_index_update.assert_called_with(biz_id)
    mock_storage.download_file.assert_called()


@pytest.mark.asyncio
@patch("ingestion.services.ingestion_service.IngestionRepository")
async def test_process_job_failure_updates_status(mock_repo_cls, mock_repo, monkeypatch):
    monkeypatch.setenv("TENANT_SCHEMA", "tenant_test")
    mock_repo_cls.return_value = mock_repo
    
    job_id = uuid.uuid4()
    mock_repo.get_job_and_document.side_effect = Exception("Major error")
    
    from ingestion.services.ingestion_service import process_job
    result = await process_job(str(job_id))
    
    assert result is False
    # Check if update_job_status was called with FAILED
    called_with_failed = False
    for call in mock_repo.update_job_status.call_args_list:
        if call.args[1] == IngestionStatus.FAILED:
            called_with_failed = True
            break
    assert called_with_failed

# Helper for any comparison in mocks
class AnyVal:
    def __eq__(self, other): return True
pytest.any_comparison = AnyVal
