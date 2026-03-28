"""
core/pipelines/components/rag_component.py — RAG retrieval component.

Purpose:
    1. Embedding Generation: Embed the query using SentenceTransformers.
    2. Similarity Search: Retrieve top-k chunks from FAISS index.
    3. Heuristics: Determine if information is available for grounding.

Note:
    Scope classification (industry-specific vs. generic) was previously a
    separate LLM call here. It is now handled natively by the LLMComponent
    via an OUT_OF_SCOPE signal in its system prompt, saving one LLM roundtrip.
"""

import os
import numpy as np
from typing import Any

from shared.utils.logging import get_logger
from ingestion.pipeline.embedder import embed
from .vector_manager import get_index
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.rag")

# Prompt paths
_BASE_PATH = os.path.join(os.path.dirname(__file__), "../../../shared/prompts/")
_RAG_CHUNK_PATH = os.path.join(_BASE_PATH, "rag_chunk.txt")

UNKNOWN_THRESHOLD = 0.15


class RAGComponent:
    """Handles grounded document retrieval."""

    @property
    def name(self) -> str:
        return "rag"

    @property
    def is_critical(self) -> bool:
        return False

    async def execute(self, context: PipelineContext) -> None:
        if not context.transcript_en:
            return

        # Retrieval (Load index for this business)
        try:
            index, metadata = await get_index(str(context.business_id))
        except Exception as exc:
            logger.error(f"RAG: Index not available for business {context.business_id}: {exc}")
            context.info_available = False
            return

        # Embed Query
        with context.tracker.measure("RAG:Embed"):
            # Reuse embedder from ingestion (it has the same singleton model logic)
            query_vec = embed([context.transcript_en])[0].reshape(1, -1)

        # Search
        with context.tracker.measure("RAG:Search"):
            top_k = 3
            scores, indices = index.search(query_vec, min(top_k, index.ntotal))
            
            results = []
            if indices.size > 0:
                for i, idx in enumerate(indices[0]):
                    if idx < 0: continue
                    score = float(scores[0][i])
                    results.append({
                        "rank": i + 1,
                        "text": metadata[idx]["text"],
                        "score": score,
                        "is_unknown": score < UNKNOWN_THRESHOLD
                    })
            
            context.retrieved_chunks = results

        # Determine Info Availability (Heuristic from POC)
        # Info is available if:
        # - We have chunks with decent scores
        # - OR it's a short continuation turn (Yes/No/OK)
        # - OR we're deep in the conversation
        
        best_score = results[0]["score"] if results else 0.0
        word_count = len(context.transcript_en.split())
        
        # Simple continuation check
        is_short = word_count <= 8
        is_continuation = any(w in context.transcript_en.lower() for w in ["yes", "no", "ok", "sure", "thanks", "done"])
        
        context.info_available = (best_score > UNKNOWN_THRESHOLD) or (is_short and is_continuation)
        
        logger.info(f"RAG: InfoAvail={context.info_available}, BestScore={best_score:.3f}")
