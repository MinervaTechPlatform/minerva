"""
core/api/sessions.py — Conversation session endpoints.

Endpoints:
    POST /{session_id}/message         — Non-streaming (original, kept as fallback)
    POST /{session_id}/message/stream  — SSE streaming endpoint (preferred)
    POST /                             — Create a new session
"""

import json
import uuid
from typing import Optional, AsyncIterator

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.pipelines.pipeline_builder import PipelineBuilder
from core.pipelines.pipeline_context import PipelineContext
from core.services import session_service, message_service, usage_service
from shared.config.config_cache import ConfigCache
from shared.providers.provider_resolver import ProviderResolver
from shared.utils.logging import get_logger
from shared.utils.text_utils import strip_thought_blocks

logger = get_logger("core.api.sessions")
router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


class MessageRequest(BaseModel):
    text: Optional[str] = None
    language: str = "en-IN"


class MessageResponse(BaseModel):
    session_id: str
    response_text: str
    response_audio_url: Optional[str] = None
    is_complete: bool = False
    latency_ms: dict[str, float]


# ── Shared pipeline helper ────────────────────────────────────────────────────

async def _build_context(
    session_id: uuid.UUID,
    request: Request,
    text: Optional[str],
    language: str,
    audio_bytes: Optional[bytes],
) -> PipelineContext:
    business_id = uuid.UUID(request.state.business_id)
    schema_name = request.state.schema_name
    config_cache = ConfigCache.get_instance()
    client_config = config_cache.get_business_config(business_id)

    return PipelineContext(
        session_id=session_id,
        business_id=business_id,
        schema_name=schema_name,
        input_audio=audio_bytes,
        input_text=text,
        requested_language=language,
        client_config=client_config,
    )


async def _persist_results(
    context: PipelineContext,
    session_id: uuid.UUID,
) -> Optional[str]:
    """Persists messages + usage and returns the audio URL (or None)."""
    schema_name = context.schema_name

    user_msg_content = context.transcript or context.input_text or ""
    await message_service.create_message(
        session_id=session_id,
        schema_name=schema_name,
        role="user",
        content=user_msg_content,
    )

    assistant_msg = await message_service.create_message(
        session_id=session_id,
        schema_name=schema_name,
        role="assistant",
        content=context.final_response,
        is_unknown=context.is_unknown_query,
        rag_context=context.retrieved_chunks,
    )

    await usage_service.record_usage(
        session_id=session_id,
        message_id=assistant_msg.id,
        schema_name=schema_name,
        stt_seconds=context.stt_seconds,
        llm_tokens=context.llm_tokens,
        tts_characters=context.tts_characters,
        latency_ms={k: round(v * 1000) for k, v in context.tracker.all().items()},
    )

    audio_url = None
    if context.final_audio:
        audio_url = f"/api/v1/audio/{assistant_msg.id}.wav"
    return audio_url


# ── Non-streaming endpoint (kept as fallback) ─────────────────────────────────

@router.post("/{session_id}/message", response_model=MessageResponse)
async def process_message(
    session_id: uuid.UUID,
    request: Request,
    text: Optional[str] = Form(None),
    language: str = Form("en-IN"),
    audio: Optional[UploadFile] = File(None),
):
    """
    Process an incoming message (text or voice) through the pipeline.
    Returns a complete JSON response once the full pipeline finishes.
    """
    audio_bytes = await audio.read() if audio else None
    context = await _build_context(session_id, request, text, language, audio_bytes)

    builder = PipelineBuilder()
    runner = builder.build(context.business_id, channel="web")

    try:
        await runner.run(context)
    except Exception as exc:
        logger.error(f"Pipeline failure: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Conversation pipeline failed")

    audio_url = await _persist_results(context, session_id)

    return MessageResponse(
        session_id=str(session_id),
        response_text=context.final_response,
        response_audio_url=audio_url,
        is_complete=context.is_complete,
        latency_ms={k: round(v * 1000) for k, v in context.tracker.all().items()},
    )


# ── Streaming SSE endpoint ────────────────────────────────────────────────────

@router.post("/{session_id}/message/stream")
async def process_message_stream(
    session_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    text: Optional[str] = Form(None),
    language: str = Form("en-IN"),
    audio: Optional[UploadFile] = File(None),
):
    """
    SSE streaming endpoint.

    Runs STT, Translation, Memory/RAG/Goal concurrently, then streams the
    LLM response token-by-token to the client.

    SSE event format:
        data: {"delta": "<token>"}        (repeated for each token)
        data: {"done": true, "session_id": "...", "is_complete": bool,
               "latency_ms": {...}}       (final event)

    After streaming, Translation-Out and TTS run in background and the
    completed response is persisted.
    """
    audio_bytes = await audio.read() if audio else None
    context = await _build_context(session_id, request, text, language, audio_bytes)

    # Run the pre-LLM pipeline stages (STT → TranslationIn → Memory+RAG+Goal)
    # We need to split: run everything up to but NOT including LLM here so we
    # can stream the LLM call, then handle post-LLM stages.
    builder = PipelineBuilder()
    runner = builder.build(context.business_id, channel="web")

    # Split components into pre-llm and post-llm groups
    pre_llm = []
    post_llm = []
    passed_llm = False
    for component in runner.components:
        if component.name == "llm":
            passed_llm = True
            continue  # LLM handled separately below
        if passed_llm:
            if component.name == "tts" and not audio:
                continue # Skip TTS if no audio input was provided
            post_llm.append(component)
        else:
            pre_llm.append(component)

    # Run pre-LLM stages using the runner's concurrency logic
    pre_runner = PipelineBuilder._make_runner(pre_llm)
    try:
        await pre_runner.run(context)
    except Exception as exc:
        logger.error(f"Pre-LLM pipeline failure: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Pipeline failed before LLM")

    async def sse_generator() -> AsyncIterator[str]:
        """Yields SSE-formatted chunks, streams LLM, then completes post stages."""
        resolver = ProviderResolver.get_instance()
        llm = resolver.get_provider("llm", context.business_id)

        # Build the system prompt (replicating LLMComponent logic)
        from core.pipelines.components.llm_component import LLMComponent
        llm_component = LLMComponent()

        # Short-circuit cases (no info / out-of-scope) — emit as single event
        if not context.info_available:
            industry = context.client_config.get("industry", "Business")
            message = (
                f"I appreciate your interest in this detail about our {industry} services. "
                "I don't have that specific information in my current knowledge base. "
                "I've logged this for a senior representative to review. Is there anything else I can help with?"
            )
            context.final_response = message
            context.is_unknown_query = True
            yield f"data: {json.dumps({'delta': message})}\n\n"
        else:
            import os
            _PROMPT_PATH = os.path.join(
                os.path.dirname(__file__),
                "../../shared/prompts/system_prompt.txt"
            )
            with open(_PROMPT_PATH, "r") as f:
                template = f.read()

            industry = context.client_config.get("industry", "Business")
            context_text = "\n\n".join([
                f"[Snippet {c['rank']}] {c['text']}" for c in context.retrieved_chunks
            ])
            sys_prompt = template.format(
                summary=context.history_summary or "New session.",
                goal=context.goal_steer_instruction,
                context=context_text,
                question=context.transcript_en,
            )
            user_prompt = f"Question: {context.transcript_en}"

            full_response = []
            with context.tracker.measure("LLM:Generate"):
                async for delta in llm.chat_completion_stream(sys_prompt, user_prompt, temperature=0.3):
                    full_response.append(delta)
                    yield f"data: {json.dumps({'delta': delta})}\n\n"

            raw_response = "".join(full_response)

            # Post-process signals
            if "[COMPLETE]" in raw_response:
                context.is_complete = True
                raw_response = raw_response.replace("[COMPLETE]", "").strip()

            if "NO_INFO_AVAILABLE" in raw_response:
                raw_response = (
                    f"I appreciate your interest in this detail about our {industry} services. "
                    "I don't have that specific information in my current knowledge base. "
                    "I've logged this for a representative to review. Is there anything else?"
                )
                context.is_unknown_query = True

            context.llm_response_en = raw_response
            context.llm_tokens = len(sys_prompt.split()) + len(raw_response.split())

        # Run post-LLM stages (like TranslationOut and TTS) so we can stream audio if needed
        from core.pipelines.pipeline_runner import PipelineRunner as _Runner
        if post_llm:
            post_runner = _Runner(post_llm)
            try:
                await post_runner.run(context)
            except Exception as exc:
                logger.warning(f"Post-LLM stage error: {exc}")

        # If audio was generated, encode it as base64 and yield
        if context.final_audio:
            import base64
            b64_audio = base64.b64encode(context.final_audio).decode('utf-8')
            yield f"data: {json.dumps({'audio': b64_audio})}\n\n"

        # Yield 'done' to signal the end of the stream
        yield f"data: {json.dumps({'done': True, 'session_id': str(session_id), 'is_complete': context.is_complete, 'latency_ms': {k: round(v * 1000) for k, v in context.tracker.all().items()}})}\n\n"

        # Offload ONLY persistence to background tasks to return immediately
        async def background_pipeline_finish(ctx: PipelineContext, s_id: uuid.UUID):
            try:
                await _persist_results(ctx, s_id)
            except Exception as e:
                logger.error(f"Persistence failed: {e}", exc_info=True)

        background_tasks.add_task(background_pipeline_finish, context, session_id)

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Create session ────────────────────────────────────────────────────────────

@router.post("/", response_model=dict)
async def create_new_session(request: Request):
    """Start a new conversation session."""
    business_id = uuid.UUID(request.state.business_id)
    schema_name = request.state.schema_name
    user_id = request.state.user_identifier

    session = await session_service.create_session(
        schema_name=schema_name,
        channel="web",
        user_identifier=user_id,
    )

    return {"session_id": str(session.id), "status": session.status}
