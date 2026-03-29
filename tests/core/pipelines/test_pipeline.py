"""
tests/core/test_pipeline.py — Unit tests for conversation pipeline.
"""

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock

from core.pipelines.pipeline_context import PipelineContext
from core.pipelines.pipeline_runner import PipelineRunner
from core.pipelines.pipeline_builder import PipelineBuilder
from shared.exceptions.pipeline_exceptions import PipelineAbortError


@pytest.fixture
def pipeline_context(business_id):
    return PipelineContext(
        session_id=uuid.uuid4(),
        business_id=business_id,
        schema_name="tenant_test",
        input_text="Hello, how can I help you?",
        client_config={"industry": "Real Estate", "goal_description": "Book a viewing"}
    )


def test_pipeline_context_init(pipeline_context):
    assert pipeline_context.input_text == "Hello, how can I help you?"
    assert pipeline_context.schema_name == "tenant_test"
    assert pipeline_context.tracker is not None


@pytest.mark.asyncio
async def test_pipeline_runner_success(pipeline_context):
    # Mock components
    comp1 = MagicMock()
    comp1.name = "comp1"
    comp1.is_critical = True
    comp1.should_execute = AsyncMock(return_value=True)
    comp1.execute = AsyncMock()

    comp2 = MagicMock()
    comp2.name = "comp2"
    comp2.is_critical = False
    comp2.should_execute = AsyncMock(return_value=True)
    comp2.execute = AsyncMock()

    runner = PipelineRunner([comp1, comp2])
    await runner.run(pipeline_context)

    comp1.execute.assert_called_once_with(pipeline_context)
    comp2.execute.assert_called_once_with(pipeline_context)


@pytest.mark.asyncio
async def test_pipeline_runner_critical_failure(pipeline_context):
    comp_fail = MagicMock()
    comp_fail.name = "fail_comp"
    comp_fail.is_critical = True
    comp_fail.should_execute = AsyncMock(return_value=True)
    comp_fail.execute = AsyncMock(side_effect=ValueError("Boom"))

    runner = PipelineRunner([comp_fail])
    
    with pytest.raises(PipelineAbortError) as excinfo:
        await runner.run(pipeline_context)
    
    assert "fail_comp" in str(excinfo.value)


@pytest.mark.asyncio
async def test_pipeline_runner_non_critical_failure(pipeline_context):
    comp_fail = MagicMock()
    comp_fail.name = "soft_fail"
    comp_fail.is_critical = False
    comp_fail.should_execute = AsyncMock(return_value=True)
    comp_fail.execute = AsyncMock(side_effect=ValueError("Soft Boom"))

    comp_next = MagicMock()
    comp_next.name = "next_comp"
    comp_next.is_critical = True
    comp_next.should_execute = AsyncMock(return_value=True)
    comp_next.execute = AsyncMock()

    runner = PipelineRunner([comp_fail, comp_next])
    
    # Should NOT raise PipelineAbortError
    await runner.run(pipeline_context)
    
    comp_fail.execute.assert_called_once()
    comp_next.execute.assert_called_once()


def test_pipeline_builder(business_id):
    builder = PipelineBuilder()
    runner = builder.build(business_id, "web")
    
    assert len(runner.components) == 8
    assert runner.components[0].name == "stt"
    assert runner.components[-1].name == "tts"
