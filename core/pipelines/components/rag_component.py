"""
core/pipelines/components/rag_component.py — RAG retrieval component.

Purpose:
    1. Scope Classification: Is the query industry-specific?
    2. Embedding Generation: Embed the query using SentenceTransformers.
    3. Similarity Search: Retrieve top-k chunks from FAISS index.
    4. Heuristics: Determine if information is available for grounding.
"""

import os
import numpy as np
from typing import Any

from shared.providers.provider_resolver import ProviderResolver
from shared.utils.logging import get_logger
from ingestion.pipeline.embedder import embed
from .vector_manager import get_index
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.rag")

# Prompt paths
_BASE_PATH = os.path.join(os.path.dirname(__file__), "../../../shared/prompts/")
_SCOPE_PROMPT_PATH = os.path.join(_BASE_PATH, "scope_classifier.txt")
_RAG_CHUNK_PATH = os.path.join(_BASE_PATH, "rag_chunk.txt")

UNKNOWN_THRESHOLD = 0.15


class RAGComponent:
    """Handles domain classification and grounded document retrieval."""

    @property
    def name(self) -> str:
        return "rag"

    @property
    def is_critical(self) -> bool:
        return False

    async def should_execute(self, context: PipelineContext) -> bool:
        """RAG should run if transcript is present to provide context."""
        return bool(context.transcript_en)

    async def execute(self, context: PipelineContext) -> None:
        if not context.transcript_en:
            return

        # 1. Scope Classification
        await self._classify_scope(context)

        # 2. Retrieval (Load index for this business)
        try:
            index, metadata = await get_index(str(context.business_id))
        except Exception as exc:
            logger.error(f"RAG: Index not available for business {context.business_id}: {exc}")
            context.info_available = False
            return

        # 3. Embed Query
        with context.tracker.measure("RAG:Embed"):
            # Reuse embedder from ingestion (it has the same singleton model logic)
            query_vec = embed([context.transcript_en])[0].reshape(1, -1)

        # 4. Search
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

        # 5. Determine Info Availability (Heuristic from POC)
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
        
        logger.info(f"RAG: Scope={context.is_industry_specific}, InfoAvail={context.info_available}, BestScore={best_score:.3f}")

    async def _classify_scope(self, context: PipelineContext) -> None:
        """Use LLM to check if the query is Industry specific."""
        with open(_SCOPE_PROMPT_PATH, "r") as f:
            template = f.read()
        
        # Industry comes from client config
        industry = context.client_config.get("industry", "Business")
        
        prompt = template.format(
            industry=industry,
            query=context.transcript_en,
            summary=context.history_summary or "New session."
        )

        resolver = ProviderResolver.get_instance()
        llm = resolver.get_provider("llm", context.business_id, mode="quick")
        
        with context.tracker.measure("RAG:Classify"):
            choice = await llm.chat_completion(
                "You are a precise scope classifier.",
                prompt,
                max_tokens=10
            )
        
        context.is_industry_specific = "INDUSTRY_SPECIFIC" in choice.upper()
