"""
core/pipelines/components/translation_component.py — Translation pipeline components.

Purpose:
    Handles text translation between Indian languages and English.
    TranslationIn: Transcript -> English (for processing)
    TranslationOut: LLM Response -> User Language (for output)
"""

from shared.providers.provider_resolver import ProviderResolver
from shared.utils.logging import get_logger
from shared.utils.text_utils import strip_thought_blocks
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.translation")


class TranslationInComponent:
    """Translates the transcript to English if it's in a regional language."""

    @property
    def name(self) -> str:
        return "translation_in"

    @property
    def is_critical(self) -> bool:
        return False

    async def execute(self, context: PipelineContext) -> None:
        if not context.transcript:
            return

        lang = str(context.detected_language).lower().strip()
        # If already English, skip
        if "en-" in lang or lang == "en":
            context.transcript_en = context.transcript
            return

        logger.info(f"TranslationIn: Translating from {lang} to English")
        resolver = ProviderResolver.get_instance()
        provider = resolver.get_provider("translation", context.business_id)
        
        with context.tracker.measure("Translate:In"):
            context.transcript_en = await provider.translate(
                context.transcript,
                lang,
                "en-IN"
            )


class TranslationOutComponent:
    """Translates the LLM response back to the user's language."""

    @property
    def name(self) -> str:
        return "translation_out"

    @property
    def is_critical(self) -> bool:
        return False

    async def execute(self, context: PipelineContext) -> None:
        if not context.llm_response_en:
            return

        lang = str(context.detected_language).lower().strip()
        # If already English, skip
        if "en-" in lang or lang == "en":
            context.final_response = context.llm_response_en
            return

        logger.info(f"TranslationOut: Translating from English to {lang}")
        resolver = ProviderResolver.get_instance()
        provider = resolver.get_provider("translation", context.business_id)
        
        with context.tracker.measure("Translate:Out"):
            result = await provider.translate(
                context.llm_response_en,
                "en-IN",
                lang
            )
            # Ensure any reasoning blocks are stripped from the translated output
            context.final_response = strip_thought_blocks(result)
