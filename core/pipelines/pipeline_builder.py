"""
core/pipelines/pipeline_builder.py — Pipeline construction.

Purpose:
    Builds a list of pipeline components based on client configuration,
    channel requirements, and system settings.
"""

from __future__ import annotations

import uuid
from typing import Any

from shared.config.config_cache import ConfigCache
from .pipeline_runner import PipelineComponent, PipelineRunner
from .registry.component_registry import COMPONENT_REGISTRY


class PipelineBuilder:
    """Composes a pipeline instance for a specific session."""

    @staticmethod
    def build(
        business_id: uuid.UUID,
        channel: str,
    ) -> PipelineRunner:
        """
        Build a list of components and return a Runner.

        The default sequence is:
        STT → Translation → Memory → RAG → Goal → LLM → TTS
        """
        # In a real system, we'd read the specific component list from config.
        # For now, we use the standard sequence defined in the architecture.
        
        component_names = [
            "stt",
            "translation_in",
            "memory",
            "rag",
            "goal_steering",
            "llm",
            "translation_out",
            "tts"
        ]

        components = []
        for name in component_names:
            component_class = COMPONENT_REGISTRY.get(name)
            if not component_class:
                raise ValueError(f"Unknown component: {name}")
            
            components.append(component_class())

        return PipelineRunner(components)

    @staticmethod
    def _make_runner(components: list) -> PipelineRunner:
        """Create a PipelineRunner from an arbitrary component list (used by streaming endpoint)."""
        return PipelineRunner(components)
