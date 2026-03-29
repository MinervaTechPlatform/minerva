import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from core.pipelines.components.llm_component import LLMComponent
from core.pipelines.pipeline_context import PipelineContext

@pytest.fixture
def pipeline_context():
    return PipelineContext(
        session_id=uuid.uuid4(),
        business_id=uuid.uuid4(),
        schema_name="tenant_test",
        input_text="Hello",
        client_config={"industry": "Real Estate"}
    )

@pytest.mark.asyncio
@patch("core.pipelines.components.llm_component.ProviderResolver")
@patch("builtins.open", MagicMock())
async def test_llm_component_strips_think_blocks(mock_resolver_cls, pipeline_context):
    # Setup mocks
    mock_resolver = MagicMock()
    mock_resolver_cls.get_instance.return_value = mock_resolver
    
    mock_llm = AsyncMock()
    mock_resolver.get_provider.return_value = mock_llm
    
    # LLM response with a <think> block
    mock_llm.chat_completion.return_value = (
        "<think>\nThe user is asking for real estate advice.\n"
        "I should be helpful and professional.\n</think>\n"
        "Hi there! How can I assist you with Dubai real estate today?"
    )
    
    # Mocking retrieved_chunks to avoid RAG errors
    pipeline_context.retrieved_chunks = []
    pipeline_context.is_industry_specific = True
    pipeline_context.info_available = True
    
    comp = LLMComponent()
    await comp.execute(pipeline_context)
    
    # Verify the response is cleaned
    expected_response = "Hi there! How can I assist you with Dubai real estate today?"
    assert pipeline_context.llm_response_en == expected_response
    assert "<think>" not in pipeline_context.llm_response_en

@pytest.mark.asyncio
@patch("core.pipelines.components.llm_component.ProviderResolver")
@patch("builtins.open", MagicMock())
async def test_llm_component_handles_multiple_think_blocks(mock_resolver_cls, pipeline_context):
    # Setup mocks
    mock_resolver = MagicMock()
    mock_resolver_cls.get_instance.return_value = mock_resolver
    
    mock_llm = AsyncMock()
    mock_resolver.get_provider.return_value = mock_llm
    
    # LLM response with multiple <think> blocks
    mock_llm.chat_completion.return_value = (
        "<think>Thought 1</think>Hello! <think>Thought 2</think>How can I help?"
    )
    
    pipeline_context.retrieved_chunks = []
    pipeline_context.is_industry_specific = True
    pipeline_context.info_available = True
    
    comp = LLMComponent()
    await comp.execute(pipeline_context)
    
    # Verify both are removed
    assert pipeline_context.llm_response_en == "Hello! How can I help?"
    assert "<think>" not in pipeline_context.llm_response_en

@pytest.mark.asyncio
@patch("core.pipelines.components.translation_component.ProviderResolver")
async def test_translation_out_strips_think_blocks(mock_resolver_cls, pipeline_context):
    from core.pipelines.components.translation_component import TranslationOutComponent
    
    mock_resolver = MagicMock()
    mock_resolver_cls.get_instance.return_value = mock_resolver
    mock_provider = AsyncMock()
    mock_resolver.get_provider.return_value = mock_provider
    
    # Simulate translation returning a <think> block (or failing to strip it)
    mock_provider.translate.return_value = "<think>Translated thought</think>Actual translation"
    
    pipeline_context.llm_response_en = "Some input"
    pipeline_context.detected_language = "hi-IN" # Force translation
    
    comp = TranslationOutComponent()
    await comp.execute(pipeline_context)
    
    assert pipeline_context.final_response == "Actual translation"
    assert "<think>" not in pipeline_context.final_response

@pytest.mark.asyncio
@patch("core.pipelines.components.tts_component.ProviderResolver")
async def test_tts_component_strips_think_blocks_safety(mock_resolver_cls, pipeline_context):
    from core.pipelines.components.tts_component import TTSComponent
    
    mock_resolver = MagicMock()
    mock_resolver_cls.get_instance.return_value = mock_resolver
    mock_provider = AsyncMock()
    mock_resolver.get_provider.return_value = mock_provider
    mock_provider.text_to_speech.return_value = b"audio_data"
    
    # Set final_response with a <think> block that somehow slipped through
    pipeline_context.final_response = "<think>Uncleaned thought</think>Speech text"
    pipeline_context.detected_language = "en-IN"
    
    comp = TTSComponent()
    await comp.execute(pipeline_context)
    
    # Verify the input to TTS was cleaned
    mock_provider.text_to_speech.assert_called_once()
    args, _ = mock_provider.text_to_speech.call_args
    assert "Uncleaned thought" not in args[0]
    assert args[0] == "Speech text"
    assert pipeline_context.final_response == "Speech text"
