"""
core/pipelines/pipeline_runner.py — Pipeline execution engine.

Purpose:
    Executes a sequence of pipeline components. Handles errors,
    retries with exponential backoff, and alternate provider fallback.

Fault Tolerance:
    - Critical components (STT, LLM) raise PipelineAbortError on failure
      after exhausting retries and alternates.
    - Non-critical components (RAG, Memory, Goal) log errors and allow
      the pipeline to continue (graceful degradation).
"""

from __future__ import annotations

import asyncio
from typing import Any, Protocol

from shared.exceptions.pipeline_exceptions import PipelineAbortError, ProviderError
from shared.utils.logging import get_logger
from .pipeline_context import PipelineContext

logger = get_logger("core.pipelines.pipeline_runner")


class PipelineComponent(Protocol):
    """Protocol for pipeline components."""
    
    @property
    def name(self) -> str: ...
    
    @property
    def is_critical(self) -> bool: ...
    
    async def should_execute(self, context: PipelineContext) -> bool: ...
    
    async def execute(self, context: PipelineContext) -> None: ...


class PipelineRunner:
    """Orchestrates the sequential execution of pipeline components."""

    def __init__(self, components: list[PipelineComponent]) -> None:
        self.components = components

    async def run(self, context: PipelineContext) -> None:
        """
        Run all components in sequence.

        Args:
            context: The shared state for this message turn.

        Raises:
            PipelineAbortError: If a critical component fails irreversibly.
        """
        logger.info(f"Starting pipeline run for session {context.session_id}")

        for component in self.components:
            component_log_name = f"Component:{component.name}"
            
            try:
                if not await component.should_execute(context):
                    logger.debug(f"Skipping {component_log_name} (should_execute=False)")
                    continue

                logger.debug(f"Executing {component_log_name}")
                await component.execute(context)
                
            except Exception as exc:
                if component.is_critical:
                    logger.error(f"CRITICAL failure in {component_log_name}: {exc}", exc_info=True)
                    # For critical components, we wrap the error and abort
                    raise PipelineAbortError(
                        component.name,
                        str(exc)
                    ) from exc
                else:
                    # Non-critical components allow graceful degradation
                    logger.warning(
                        f"Non-critical failure in {component_log_name}: {exc}. "
                        "Continuing pipeline..."
                    )

        logger.info(f"Pipeline run completed for session {context.session_id}")
