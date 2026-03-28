"""
core/pipelines/components/tts_component.py — Text-to-Speech pipeline component.

Purpose:
    Converts the final text response into synthesized audio bytes.
    Critical component for voice-enabled sessions.
"""

from shared.providers.provider_resolver import ProviderResolver
from shared.exceptions.pipeline_exceptions import ProviderError
from shared.utils.logging import get_logger
from shared.utils.text_utils import strip_thought_blocks
from ..pipeline_context import PipelineContext

logger = get_logger("core.pipelines.components.tts")


class TTSComponent:
    """Invokes the TTS provider to generate audio response."""

    @property
    def name(self) -> str:
        return "tts"

    @property
    def is_critical(self) -> bool:
        """TTS failure is considered critical for voice channels."""
        return True

    async def execute(self, context: PipelineContext) -> None:
        # Final safety cleanup before synthesis
        if context.final_response:
            context.final_response = strip_thought_blocks(context.final_response)

        if not context.final_response:
            logger.debug("TTS: final_response is empty. Skipping.")
            return

        resolver = ProviderResolver.get_instance()
        provider = resolver.get_provider("tts", context.business_id)

        # Get voice settings from client config
        speaker = context.client_config.get("tts_speaker", "anushka")
        pace = float(context.client_config.get("tts_pace", 1.0))
        lang = str(context.detected_language or "en-IN")

        with context.tracker.measure("TTS"):
            try:
                # 1. Try primary provider
                audio = await provider.text_to_speech(
                    context.final_response,
                    language_code=lang,
                    speaker=speaker,
                    pace=pace
                )
            except ProviderError as exc:
                # 2. Try alternate provider on failure
                logger.warning(
                    f"TTS: primary provider '{provider.provider_name}' failed. Trying alternate."
                )
                alt_provider = resolver.get_alternate_provider(
                    "tts", provider.provider_name, context.business_id
                )
                
                if not alt_provider:
                    raise  # No alternate, original error bubbled up

                audio = await alt_provider.text_to_speech(
                    context.final_response,
                    language_code=lang,
                    speaker=speaker,
                    pace=pace
                )

        context.final_audio = audio
        context.tts_characters = len(context.final_response)
        logger.info(f"TTS: Synthesized {len(audio)} bytes of audio.")
