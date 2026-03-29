"""
tests/ingestion/pipeline/test_vector_store.py — Unit tests for vector store with mocked storage.
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from unittest.mock import MagicMock, patch, AsyncMock

import numpy as np
import pytest

faiss = pytest.importorskip("faiss", reason="faiss not installed")

from ingestion.pipeline.vector_store import (
    build_index,
    save_index,
    archive_previous_index,
    load_index,
    _active_index_prefix,
    _archive_index_prefix,
)
from shared.exceptions.pipeline_exceptions import IngestionError

@pytest.fixture
def mock_storage():
    storage = MagicMock()
    storage.upload_file = AsyncMock()
    storage.download_file = AsyncMock()
    storage.copy_file = AsyncMock()
    
    # Patch the resolver to return our mock
    with patch("ingestion.pipeline.vector_store.get_storage_provider", return_value=storage):
        yield storage

@pytest.fixture
def embeddings_3x4() -> np.ndarray:
    """3 L2-normalised vectors of dim 4."""
    rng = np.random.default_rng(0)
    e = rng.random((3, 4)).astype(np.float32)
    return e / np.linalg.norm(e, axis=1, keepdims=True)

@pytest.fixture
def metadata_3() -> list[dict]:
    return [
        {"text": f"chunk {i}", "chunk_idx": i, "document_id": "doc-1"}
        for i in range(3)
    ]

# ── build_index ───────────────────────────────────────────────────────────────

class TestBuildIndex:
    def test_returns_faiss_index(self, embeddings_3x4, metadata_3):
        index = build_index(embeddings_3x4, metadata_3)
        assert index.ntotal == 3
        assert index.d == 4

    def test_empty_embeddings_raises(self, metadata_3):
        empty = np.zeros((0, 4), dtype=np.float32)
        with pytest.raises(IngestionError, match="non-empty"):
            build_index(empty, metadata_3)

# ── save_index ────────────────────────────────────────────────────────────────

class TestSaveIndex:
    @pytest.mark.asyncio
    async def test_uploads_two_files_to_storage(self, embeddings_3x4, metadata_3, mock_storage):
        index = build_index(embeddings_3x4, metadata_3)
        business_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())

        result = await save_index(index, metadata_3, business_id, job_id)

        assert mock_storage.upload_file.call_count == 2
        assert business_id in result

# ── archive_previous_index ────────────────────────────────────────────────────

class TestArchivePreviousIndex:
    @pytest.mark.asyncio
    async def test_copies_both_files(self, mock_storage):
        business_id = "business-1"
        job_id = "job-1"
        await archive_previous_index(business_id, job_id)
        assert mock_storage.copy_file.call_count == 2

    @pytest.mark.asyncio
    async def test_copy_failure_does_not_raise(self, mock_storage):
        mock_storage.copy_file.side_effect = Exception("Copy failed")
        # Should not raise — just logs a warning
        await archive_previous_index("client-1", "job-1")

# ── load_index ────────────────────────────────────────────────────────────────

class TestLoadIndex:
    @pytest.mark.asyncio
    async def test_load_raises_on_storage_failure(self, mock_storage):
        mock_storage.download_file.side_effect = Exception("Storage not found")
        with pytest.raises(IngestionError, match="Failed to download"):
            await load_index("business-1")

    @pytest.mark.asyncio
    async def test_load_returns_index_and_metadata(self, embeddings_3x4, metadata_3, mock_storage):
        """
        Save a real index to a tempdir and mock download to use that dir.
        """
        # Build and write index to temp files
        index = build_index(embeddings_3x4, metadata_3)
        tmpdir = tempfile.mkdtemp()
        index_file = os.path.join(tmpdir, "faiss.index")
        meta_file = os.path.join(tmpdir, "chunk_metadata.json")
        faiss.write_index(index, index_file)
        with open(meta_file, "w") as fh:
            json.dump(metadata_3, fh)

        # Mock download_file to copy from our tmpdir
        async def fake_download(bucket, key, local_path):
            import shutil
            if key.endswith("faiss.index"):
                shutil.copy(index_file, local_path)
            elif key.endswith("chunk_metadata.json"):
                shutil.copy(meta_file, local_path)

        mock_storage.download_file.side_effect = fake_download

        loaded_index, loaded_meta = await load_index("business-1")
        assert loaded_index.ntotal == 3
        assert len(loaded_meta) == 3

# ── Path helpers ──────────────────────────────────────────────────────────────

class TestPathHelpers:
    def test_active_prefix(self):
        assert _active_index_prefix("abc") == "businesses/abc/index"

    def test_archive_prefix(self):
        assert _archive_index_prefix("abc", "job1") == "businesses/abc/archives/job1"
