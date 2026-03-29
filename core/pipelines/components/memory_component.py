"""
core/pipelines/components/memory_component.py — Conversation Memory component.

Purpose:
    Manages context via Repository abstraction.
"""

import os
from core.repositories.session_repository import SessionRepository
from core.repositories.message_repository import MessageRepository
from shared.providers.provider_resolver import ProviderResolver
from shared.utils.logging import get_logger
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.memory")

_PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), 
    "../../../shared/prompts/conversation_summary.txt"
)


class MemoryComponent:
    """Handles conversation summary persistence using Repository."""

    @property
    def name(self) -> str:
        return "memory"

    @property
    def is_critical(self) -> bool:
        return False

    async def should_execute(self, context: PipelineContext) -> bool:
        """Memory logic always runs to maintain session state."""
        return True

    async def execute(self, context: PipelineContext) -> None:
        session_repo = SessionRepository(context.schema_name)
        message_repo = MessageRepository(context.schema_name)
        
        # 1. Load summary
        session = await session_repo.get_by_id(context.session_id)
        if session:
            context.history_summary = session.conversation_summary or ""
        
        # 2. Update every 3 turns
        history = await message_repo.get_history(context.session_id, limit=6)
        if len(history) > 0 and len(history) % 6 == 0:
            await self._update_summary(context, session_repo, history)

    async def _update_summary(self, context, repo, history) -> None:
        logger.info(f"Memory: Updating summary for session {context.session_id}")
        
        recent_text = "\n".join([f"{m.role}: {m.content}" for m in history])

        with open(_PROMPT_PATH, "r") as f:
            template = f.read()
        
        prompt = template.format(
            previous_summary=context.history_summary or "New conversation.",
            recent_messages=recent_text
        )

        resolver = ProviderResolver.get_instance()
        llm = resolver.get_provider("llm", context.business_id)
        
        with context.tracker.measure("Memory:Summarize"):
            new_summary = await llm.chat_completion(
                "You are an expert summarizer.",
                prompt,
                max_tokens=150
            )
        
        context.history_summary = new_summary
        await repo.update_summary(context.session_id, new_summary)
        logger.info("Memory: Summary updated via Repository.")
