"""
core/pipelines/pipeline_runner.py — Pipeline execution engine.

Purpose:
    Executes pipeline components with optimised concurrency.

Execution Order:
    1. stt            (sequential, critical)
    2. translation_in  (sequential)
    3. memory + rag + goal_steering  (concurrent via asyncio.gather)
    4. llm            (sequential, critical)
    5. translation_out (sequential)
    6. tts            (sequential, critical)

Fault Tolerance:
    - Critical components (STT, LLM, TTS) raise PipelineAbortError on failure.
    - Non-critical components (RAG, Memory, Goal) log errors and continue
      (graceful degradation).
"""

from __future__ import annotations

import asyncio
from typing import Any, Protocol

from shared.exceptions.pipeline_exceptions import PipelineAbortError, ProviderError
from shared.utils.logging import get_logger
from .pipeline_context import PipelineContext

logger = get_logger("core.pipelines.pipeline_runner")

# Components that can run concurrently after translation_in completes.
_PARALLEL_STAGE = {"memory", "rag", "goal_steering"}


class PipelineComponent(Protocol):
    """Protocol for pipeline components."""
    
    @property
    def name(self) -> str: ...
    
    @property
    def is_critical(self) -> bool: ...
    
    async def execute(self, context: PipelineContext) -> None: ...


class PipelineRunner:
    """Orchestrates the execution of pipeline components with concurrency."""

    def __init__(self, components: list[PipelineComponent]) -> None:
        self.components = components

    # ── helpers ──────────────────────────────────────────────────────────────

    async def _run_component(self, component: PipelineComponent, context: PipelineContext) -> None:
        """Execute a single component, honouring its criticality contract."""
        component_log_name = f"Component:{component.name}"
        try:
            logger.debug(f"Executing {component_log_name}")
            await component.execute(context)
        except Exception as exc:
            if component.is_critical:
                logger.error(f"CRITICAL failure in {component_log_name}: {exc}", exc_info=True)
                raise PipelineAbortError(component.name, str(exc)) from exc
            else:
                logger.warning(
                    f"Non-critical failure in {component_log_name}: {exc}. "
                    "Continuing pipeline..."
                )

    # ── main entrypoint ───────────────────────────────────────────────────────

    async def run(self, context: PipelineContext) -> None:
        """
        Run all components, executing the parallel middle stage concurrently.

        Stage ordering:
            Sequential → (stt, translation_in)
            Concurrent → (memory, rag, goal_steering)  via asyncio.gather
            Sequential → (llm, translation_out, tts)

        Raises:
            PipelineAbortError: If a critical component fails irreversibly.
        """
        logger.info(f"Starting pipeline run for session {context.session_id}")

        sequential_pre: list[PipelineComponent] = []
        parallel_middle: list[PipelineComponent] = []
        sequential_post: list[PipelineComponent] = []
        in_parallel = False
        past_parallel = False

        for component in self.components:
            if component.name in _PARALLEL_STAGE:
                in_parallel = True
                parallel_middle.append(component)
            elif in_parallel:
                past_parallel = True
                sequential_post.append(component)
            else:
                sequential_pre.append(component)

        # 1. Sequential pre-stage
        for component in sequential_pre:
            await self._run_component(component, context)

        # 2. Concurrent middle stage
        if parallel_middle:
            logger.debug(
                f"Running concurrently: {[c.name for c in parallel_middle]}"
            )
            await asyncio.gather(
                *[self._run_component(c, context) for c in parallel_middle]
            )

        # 3. Sequential post-stage
        for component in sequential_post:
            await self._run_component(component, context)

        logger.info(f"Pipeline run completed for session {context.session_id}")
