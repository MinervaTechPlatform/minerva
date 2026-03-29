"""
core/pipelines/pipeline_context.py — Pipeline session state.

Purpose:
    The context object passed through each pipeline component during a
    single message turn. It stores inputs, intermediate results,
    and final outputs.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from shared.utils.latency_tracker import LatencyTracker


@dataclass
class PipelineContext:
    """Session state for a single pipeline execution turn."""

    # ── Input ────────────────────────────────────────────────────────────────
    session_id: uuid.UUID
    business_id: uuid.UUID
    schema_name: str
    
    # Input data (audio or text)
    input_audio: Optional[bytes] = None
    input_text: Optional[str] = None
    
    # Language context
    requested_language: str = "unknown"  # BCP-47 hint
    
    # Selection Mode (quick vs deep)
    response_mode: str = "quick" 
    
    # ── State / Intermediate ──────────────────────────────────────────────────
    
    # Transcription results
    transcript: str = ""
    detected_language: str = "unknown"
    
    # Translation (if transcript is not English)
    transcript_en: str = ""
    
    # Classification
    is_industry_specific: bool = True
    
    # Memory / Summary
    history_summary: str = ""
    
    # RAG Results
    retrieved_chunks: list[dict[str, Any]] = field(default_factory=list)
    info_available: bool = True
    
    # Goal Steering
    goal_steer_instruction: str = "None"
    
    # LLM Result
    llm_response_en: str = ""
    is_unknown_query: bool = False  # Set if info not found in RAG
    is_complete: bool = False       # Set if [COMPLETE] signal detected
    
    # Final Response (translated back if needed)
    final_response: str = ""
    final_audio: Optional[bytes] = None
    
    # Instrumentation
    tracker: LatencyTracker = field(default_factory=LatencyTracker)
    
    # Usage metrics
    stt_seconds: float = 0.0
    llm_tokens: int = 0
    tts_characters: int = 0
    
    # Metadata / Configuration
    client_config: dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.input_text and not self.input_audio:
            raise ValueError("PipelineContext must have either input_text or input_audio")
