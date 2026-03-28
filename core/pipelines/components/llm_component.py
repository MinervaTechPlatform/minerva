"""
core/pipelines/components/llm_component.py — Grounded response generation.

Purpose:
    Assembles the full context and generates the final AI response.
    Handles grounded retrieval (RAG), goal steering, and scope denial.
    Detects signals for session completion and missing info.
    Strips <think>...</think> blocks from all responses.
"""

import os
from shared.providers.provider_resolver import ProviderResolver
from shared.utils.logging import get_logger
from shared.utils.text_utils import strip_thought_blocks
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.llm")

# Prompt paths
_PROMPT_PATH = os.path.join(
    os.path.dirname(__file__), 
    "../../../shared/prompts/system_prompt.txt"
)


class LLMComponent:
    """Generates the grounded response using specified LLM provider."""

    @property
    def name(self) -> str:
        return "llm"

    @property
    def is_critical(self) -> bool:
        return True

    async def execute(self, context: PipelineContext) -> None:
        # 1. Handle Out-of-Scope (Case 1)
        if not context.is_industry_specific and not context.info_available:
            industry = context.client_config.get("industry", "Business")
            context.llm_response_en = (
                f"I am sorry, I can only assist with inquiries related to {industry}. "
                "Can I help you with any more questions on this topic?"
            )
            logger.info("LLM: Handled as Out-of-Scope")
            return

        # 2. Handle Industry Specific but No Info (Case 4)
        if context.is_industry_specific and not context.info_available:
            industry = context.client_config.get("industry", "Business")
            context.llm_response_en = (
                f"I appreciate your interest in this detail about our {industry} services. "
                "I don't have that specific information in my current knowledge base. "
                "I've logged this for a senior representative to review. Is there anything else I can help with?"
            )
            context.is_unknown_query = True
            logger.info("LLM: Handled as Unknown (No Info)")
            return

        # 3. Proceed to Grounded LLM Generation
        await self._generate_grounded_response(context)

    async def _generate_grounded_response(self, context: PipelineContext) -> None:
        """Assembles context and calls LLM."""
        # 1. Prepare snippets
        context_text = "\n\n".join([
            f"[Snippet {c['rank']}] {c['text']}" for c in context.retrieved_chunks
        ])
        
        # 2. Get system prompt template
        with open(_PROMPT_PATH, "r") as f:
            template = f.read()

        sys_prompt = template.format(
            summary=context.history_summary or "New session.",
            goal=context.goal_steer_instruction,
            context=context_text,
            question=context.transcript_en
        )
        
        user_prompt = f"Question: {context.transcript_en}"

        # 3. Call LLM
        resolver = ProviderResolver.get_instance()
        llm = resolver.get_provider("llm", context.business_id)

        try:
            with context.tracker.measure("LLM:Generate"):
                response = await llm.chat_completion(
                    sys_prompt,
                    user_prompt,
                    temperature=0.3
                )
        except Exception as exc:
            logger.error(f"LLM primary failed: {exc}")
            alt_llm = resolver.get_alternate_provider("llm", llm.provider_name, context.business_id)
            if not alt_llm:
                raise
            with context.tracker.measure("LLM:Generate_Fallback"):
                response = await alt_llm.chat_completion(sys_prompt, user_prompt)

        # 4. Post-process signals
        if "[COMPLETE]" in response:
            context.is_complete = True
            response = response.replace("[COMPLETE]", "").strip()
            logger.info("LLM: [COMPLETE] signal detected.")

        if "NO_INFO_AVAILABLE" in response:
            industry = context.client_config.get("industry", "Business")
            response = (
                f"I appreciate your interest in this detail about our {industry} services. "
                "I don't have that specific information in my current knowledge base. "
                "I've logged this for a representative to review. Is there anything else?"
            )
            context.is_unknown_query = True
            logger.info("LLM: NO_INFO_AVAILABLE signal detected.")

        context.llm_response_en = response
        context.llm_tokens = len(sys_prompt.split()) + len(response.split())
        logger.info(f"LLM: Generated response ({len(response)} chars)")
