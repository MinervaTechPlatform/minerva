"""
tests/core/pipelines/test_llm_fallback.py — Unit tests for dual-mode LLM fallback logic.
"""

import pytest
import uuid
from unittest.mock import MagicMock, patch, AsyncMock
from core.pipelines.components.rag_component import RAGComponent
from core.pipelines.components.llm_component import LLMComponent
from core.pipelines.pipeline_context import PipelineContext

@pytest.fixture
def context():
    business_id = uuid.uuid4()
    ctx = PipelineContext(
        session_id=uuid.uuid4(),
        business_id=business_id,
        schema_name="test_schema",
        input_text="Test query"
    )
    ctx.transcript_en = "Test query"
    ctx.retrieved_chunks = []
    ctx.goal_steer_instruction = "Be helpful"
    return ctx

@pytest.mark.asyncio
async def test_quick_mode_fallback(context):
    """Verify Quick Mode: Sarvam (Primary) fails -> Groq (Fallback) is called."""
    with patch("shared.providers.provider_resolver.ProviderResolver.get_instance") as mock_get_instance:
        mock_resolver = MagicMock()
        mock_get_instance.return_value = mock_resolver
        
        # Primary (Sarvam) fails
        primary_llm = AsyncMock()
        primary_llm.provider_name = "sarvam"
        primary_llm.chat_completion.side_effect = Exception("Sarvam Down")
        
        # Fallback (Groq) succeeds
        fallback_llm = AsyncMock()
        fallback_llm.provider_name = "groq"
        fallback_llm.chat_completion.return_value = "INDUSTRY_SPECIFIC"
        
        # Mock resolver behavior
        def side_effect_get(category, bid, mode="quick"):
            if mode == "quick": return primary_llm
            return None
            
        def side_effect_alt(category, current, bid, mode="quick"):
            if mode == "quick" and current == "sarvam": return fallback_llm
            return None
            
        mock_resolver.get_provider.side_effect = side_effect_get
        mock_resolver.get_alternate_provider.side_effect = side_effect_alt
        
        rag = RAGComponent()
        with patch("builtins.open", MagicMock()):
            await rag._classify_scope(context)
            
        # Verify both were called
        primary_llm.chat_completion.assert_called_once()
        fallback_llm.chat_completion.assert_called_once()
        assert context.is_industry_specific is True

@pytest.mark.asyncio
async def test_deep_mode_fallback(context):
    """Verify Deep Mode: Groq (Primary) fails -> Sarvam (Fallback) is called."""
    with patch("shared.providers.provider_resolver.ProviderResolver.get_instance") as mock_get_instance:
        mock_resolver = MagicMock()
        mock_get_instance.return_value = mock_resolver
        
        # Primary (Groq) fails
        primary_llm = AsyncMock()
        primary_llm.provider_name = "groq"
        primary_llm.chat_completion.side_effect = Exception("Groq Down")
        
        # Fallback (Sarvam) succeeds
        fallback_llm = AsyncMock()
        fallback_llm.provider_name = "sarvam"
        fallback_llm.chat_completion.return_value = "Fallback response"
        
        # Mock resolver behavior
        def side_effect_get(category, bid, mode="quick"):
            if mode == "deep": return primary_llm
            return None
            
        def side_effect_alt(category, current, bid, mode="quick"):
            if mode == "deep" and current == "groq": return fallback_llm
            return None
            
        mock_resolver.get_provider.side_effect = side_effect_get
        mock_resolver.get_alternate_provider.side_effect = side_effect_alt
        
        llm_comp = LLMComponent()
        with patch("builtins.open", MagicMock()):
            await llm_comp._generate_grounded_response(context)
            
        # Verify both were called
        primary_llm.chat_completion.assert_called_once()
        fallback_llm.chat_completion.assert_called_once()
        assert context.llm_response_en == "Fallback response"
