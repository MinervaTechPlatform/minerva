"""
tests/core/test_pipeline_refactored.py — Unit tests for Pipeline Components with Repositories.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core.pipelines.components.memory_component import MemoryComponent
from core.pipelines.pipeline_context import PipelineContext

@pytest.mark.asyncio
@patch("core.pipelines.components.memory_component.SessionRepository")
@patch("core.pipelines.components.memory_component.MessageRepository")
async def test_memory_component_execution(mock_msg_repo_cls, mock_session_repo_cls):
    # Setup mocks
    mock_session_repo = AsyncMock()
    mock_session_repo_cls.return_value = mock_session_repo
    
    mock_msg_repo = AsyncMock()
    mock_msg_repo_cls.return_value = mock_msg_repo
    
    # Mock data
    session_id = uuid.uuid4()
    mock_session_repo.get_by_id.return_value = MagicMock(conversation_summary="Old summary")
    mock_msg_repo.get_history.return_value = [] # Not enough for re-summarization
    
    context = PipelineContext(
        session_id=session_id,
        business_id=uuid.uuid4(),
        schema_name="tenant_test",
        input_text="Hi"
    )
    
    comp = MemoryComponent()
    await comp.execute(context)
    
    # Verify load
    assert context.history_summary == "Old summary"
    mock_session_repo.get_by_id.assert_called_with(session_id)

@pytest.mark.asyncio
@patch("core.pipelines.components.vector_manager.get_storage_provider")
@patch("faiss.read_index")
@patch("json.load")
async def test_vector_manager_download(mock_json_load, mock_faiss_read, mock_get_storage):
    from core.pipelines.components.vector_manager import get_index, _INDEX_CACHE
    _INDEX_CACHE.clear()
    
    mock_storage = AsyncMock()
    mock_get_storage.return_value = mock_storage
    
    mock_faiss_read.return_value = MagicMock(ntotal=100)
    mock_json_load.return_value = [{"text": "chunk1"}]
    
    # We need to mock open() as well since vector_manager opens temp files
    with patch("builtins.open", MagicMock()):
        idx, meta = await get_index("biz_123")
    
    assert idx.ntotal == 100
    assert meta[0]["text"] == "chunk1"
    mock_storage.download_file.assert_called()
