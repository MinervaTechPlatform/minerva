"""
tests/core/test_dual_llm.py — Verify RAG and LLM components use different model modes.
"""

import pytest
import uuid
from unittest.mock import MagicMock, patch, AsyncMock
from core.pipelines.components.rag_component import RAGComponent
from core.pipelines.components.llm_component import LLMComponent
from core.pipelines.pipeline_context import PipelineContext

@pytest.mark.asyncio
async def test_dual_llm_modes():
    business_id = uuid.uuid4()
    context = PipelineContext(
        session_id=uuid.uuid4(),
        business_id=business_id,
        schema_name="test_schema",
        input_text="Hello"
    )
    context.transcript_en = "Hello"
    
    # Mock ProviderResolver
    with patch("shared.providers.provider_resolver.ProviderResolver.get_instance") as mock_get_instance:
        mock_resolver = MagicMock()
        mock_get_instance.return_value = mock_resolver
        
        # Mock LLM provider
        mock_llm = AsyncMock()
        mock_llm.chat_completion.return_value = "Response content"
        mock_resolver.get_provider.return_value = mock_llm
        
        # 1. Verify RAGComponent requests "quick" mode
        rag = RAGComponent()
        # Only test the _classify_scope method which uses LLM
        with patch("builtins.open", MagicMock()):
            await rag._classify_scope(context)
        
        mock_resolver.get_provider.assert_called_with("llm", business_id, mode="quick")
        
        # Reset mock for next check
        mock_resolver.get_provider.reset_mock()
        
        # 2. Verify LLMComponent requests "deep" mode
        llm_comp = LLMComponent()
        with patch("builtins.open", MagicMock()):
            # Mocking some context attributes that LLMComponent expects
            context.retrieved_chunks = []
            context.goal_steer_instruction = "Be helpful"
            
            await llm_comp._generate_grounded_response(context)
            
        mock_resolver.get_provider.assert_called_with("llm", business_id, mode="deep")
