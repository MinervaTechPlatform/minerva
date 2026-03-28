"""
tests/ingestion/pipeline/test_embedder.py — Unit tests for the FastEmbed-based embedder.
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

import ingestion.pipeline.embedder as emb_mod
from ingestion.pipeline.embedder import embed
from shared.exceptions.pipeline_exceptions import IngestionError

@pytest.fixture(autouse=True)
def clear_cache():
    emb_mod._model_cache.clear()
    yield
    emb_mod._model_cache.clear()

@pytest.fixture
def mock_fastembed():
    with patch("fastembed.TextEmbedding") as mock_cls:
        mock_instance = MagicMock()
        mock_cls.return_value = mock_instance
        # Default: zeros
        mock_instance.embed.side_effect = lambda texts, **kw: (np.zeros(384) for _ in texts)
        yield mock_instance

class TestEmbedShape:
    def test_embed_returns_2d_array(self, sample_chunks, mock_fastembed):
        texts = [c["text"] for c in sample_chunks]
        result = embed(texts)
        assert result.ndim == 2
        assert result.shape[0] == len(texts)
        assert result.shape[1] == 384

    def test_embed_returns_float32(self, sample_chunks, mock_fastembed):
        texts = [c["text"] for c in sample_chunks]
        result = embed(texts)
        assert result.dtype == np.float32

    def test_embed_vectors_are_normalised(self, sample_chunks, mock_fastembed):
        """L2 norm of each embedding should be ~1.0."""
        # Override mock to return non-zero vectors so normalisation is meaningful
        mock_fastembed.embed.side_effect = lambda texts, **kw: (np.ones(384) for _ in texts)
        
        texts = [c["text"] for c in sample_chunks]
        result = embed(texts)
        norms = np.linalg.norm(result, axis=1)
        np.testing.assert_allclose(norms, np.ones(len(texts)), atol=1e-5)

class TestEmbedValidation:
    def test_empty_chunks_raises_value_error(self):
        with pytest.raises(ValueError, match="empty"):
            embed([])

    def test_single_chunk_works(self, mock_fastembed):
        result = embed(["Single sentence for embedding."])
        assert result.shape[0] == 1

class TestEmbedModelCache:
    def test_model_loaded_once_for_same_name(self, sample_chunks, mock_fastembed):
        """The model singleton should only be loaded once."""
        texts = [c["text"] for c in sample_chunks]
        embed(texts)
        embed(texts)

        from fastembed import TextEmbedding
        assert TextEmbedding.call_count == 1

class TestEmbedMissingLibrary:
    def test_import_error_raises_ingestion_error(self, sample_chunks):
        """When fastembed is not importable, IngestionError is raised."""
        # Temporarily hide fastembed
        saved = sys.modules.pop("fastembed", None)

        def fake_import(name, *args, **kwargs):
            if name == "fastembed":
                raise ImportError("Mocked missing fastembed")
            return __import__(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=fake_import):
            with pytest.raises(IngestionError, match="fastembed is not installed"):
                emb_mod._get_model("some-model")

        # Restore
        if saved:
            sys.modules["fastembed"] = saved
