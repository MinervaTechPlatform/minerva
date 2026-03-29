"""
shared/providers/provider_resolver.py — Dynamic provider selection (Singleton).

Purpose:
    Resolves which provider implementation to use for each category
    (STT, LLM, TTS, Translation) based on business configuration or
    system defaults.

Pattern:
    Singleton — one instance per process.

Resolution Order:
    1. business configs.provider_overrides (per-tenant, highest priority)
    2. system_settings (global default, fallback)

Default providers (from system_settings):
    stt         → sarvam  (fallback: elevenlabs)
    tts         → sarvam  (fallback: elevenlabs)
    llm         → sarvam  (fallback: groq)
    translation → sarvam  (no fallback — only one provider)

System setting keys:
    default_stt_provider, fallback_stt_provider
    default_tts_provider, fallback_tts_provider
    default_llm_provider, fallback_llm_provider
    default_translation_provider
"""

from __future__ import annotations

from typing import Optional

from shared.utils.logging import get_logger

logger = get_logger("shared.providers.provider_resolver")

# ── Registry maps: name → lazy import path ────────────────────────────────────

_STT_REGISTRY: dict[str, tuple[str, str]] = {
    "sarvam":    ("shared.providers.stt.stt_sarvam",       "STTSarvam"),
    "deepgram":  ("shared.providers.stt.stt_deepgram",     "STTDeepgram"),
    "elevenlabs":("shared.providers.stt.stt_deepgram",     "STTDeepgram"),  # ElevenLabs doesn't do STT; map to deepgram
}

_TTS_REGISTRY: dict[str, tuple[str, str]] = {
    "sarvam":    ("shared.providers.tts.tts_sarvam",       "TTSSarvam"),
    "elevenlabs":("shared.providers.tts.tts_elevenlabs",   "TTSElevenLabs"),
}

_LLM_REGISTRY: dict[str, tuple[str, str]] = {
    "sarvam":    ("shared.providers.llm.llm_sarvam",       "LLMSarvam"),
    "openai":    ("shared.providers.llm.llm_openai",       "LLMOpenAI"),
    "groq":      ("shared.providers.llm.llm_groq",         "LLMGroq"),
}

_TRANSLATION_REGISTRY: dict[str, tuple[str, str]] = {
    "sarvam":    ("shared.providers.translation.translation_sarvam", "TranslationSarvam"),
}

_CATEGORY_REGISTRIES = {
    "stt":         _STT_REGISTRY,
    "tts":         _TTS_REGISTRY,
    "llm":         _LLM_REGISTRY,
    "translation": _TRANSLATION_REGISTRY,
}

# Hard-coded defaults (overridden by system_settings at runtime)
_SYSTEM_DEFAULTS = {
    "stt":         ("sarvam",  "deepgram"),
    "tts":         ("sarvam",  "elevenlabs"),
    "llm":         ("sarvam",  "groq"),
    "translation": ("sarvam",  None),
}


class ProviderResolver:
    """
    Resolves provider instances per category.

    Usage:
        resolver = ProviderResolver.get_instance()
        stt = resolver.get_provider("stt", business_id="uuid")
        alt = resolver.get_alternate_provider("stt", current="sarvam")
    """

    _instance: Optional["ProviderResolver"] = None

    def __init__(self) -> None:
        # Cache of instantiated providers: (category, name) → provider instance
        self._cache: dict[tuple[str, str], object] = {}

    # ── Singleton ─────────────────────────────────────────────────────────────

    @classmethod
    def get_instance(cls) -> "ProviderResolver":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Public API ────────────────────────────────────────────────────────────

    def get_provider(self, category: str, business_id: str | None = None, mode: str = "quick") -> object:
        """
        Return the primary provider instance for a category.

        Args:
            category:    One of 'stt', 'tts', 'llm', 'translation'.
            business_id: Optional UUID string — if supplied, per-business
                         overrides take priority over system defaults.

        Returns:
            Provider instance implementing the appropriate ABC.

        Raises:
            ValueError: If category or provider name is not registered.
        """
        provider_name = self._resolve_primary_name(category, business_id, mode)
        return self._get_or_create(category, provider_name)

    def get_alternate_provider(
        self,
        category: str,
        current_provider_name: str,
        business_id: str | None = None,
    ) -> object | None:
        """
        Return the fallback provider for a category (used after primary fails).

        Args:
            category:              One of 'stt', 'tts', 'llm', 'translation'.
            current_provider_name: Name of the provider that just failed.
            business_id:           Optional UUID string for per-business lookup.

        Returns:
            Alternate provider instance, or None if no fallback configured.
        """
        alt_name = self._resolve_fallback_name(category, business_id)
        if alt_name is None or alt_name == current_provider_name:
            return None
        try:
            return self._get_or_create(category, alt_name)
        except Exception as exc:
            logger.error(
                f"ProviderResolver: fallback provider '{alt_name}' for "
                f"category '{category}' failed to load: {exc}"
            )
            return None

    def get_provider_name(self, category: str, business_id: str | None = None, mode: str = "quick") -> str:
        """Return the canonical name of the active primary provider."""
        return self._resolve_primary_name(category, business_id, mode)

    # ── Internal resolution ───────────────────────────────────────────────────

    def _resolve_primary_name(self, category: str, business_id: str | None, mode: str = "quick") -> str:
        """Determine primary provider name from config or system settings."""
        # Special logic for Dual-Mode LLM
        if category == "llm" and mode == "deep":
            # Deep mode defaults to fallback/alternate if set, otherwise primary
            _, fallback = _SYSTEM_DEFAULTS.get(category, ("sarvam", None))
            # Check system setting for fallback_llm_provider
            fb_setting = self._get_system_setting("fallback_llm_provider")
            return str(fb_setting) if fb_setting else (fallback or "sarvam")

        # 1. Per-business override
        if business_id:
            overrides = self._get_business_overrides(business_id)
            if category in overrides:
                return overrides[category]

        # 2. System settings
        setting_key = f"default_{category}_provider"
        name = self._get_system_setting(setting_key)
        if name:
            return str(name)

        # 3. Hard-coded default
        default, _ = _SYSTEM_DEFAULTS.get(category, ("sarvam", None))
        return default

    def _resolve_fallback_name(
        self, category: str, business_id: str | None
    ) -> str | None:
        """Determine fallback provider name from system settings."""
        setting_key = f"fallback_{category}_provider"
        name = self._get_system_setting(setting_key)
        if name:
            return str(name)
        _, fallback = _SYSTEM_DEFAULTS.get(category, ("sarvam", None))
        return fallback

    def _get_business_overrides(self, business_id: str) -> dict[str, str]:
        """Read provider_overrides from ConfigCache for this business."""
        try:
            from shared.config.config_cache import ConfigCache
            cache = ConfigCache.get_instance()
            overrides = cache.get_config_value(business_id, "provider_overrides") or {}
            return overrides if isinstance(overrides, dict) else {}
        except Exception:
            return {}

    def _get_system_setting(self, key: str):
        """Read a system setting from ConfigCache."""
        try:
            from shared.config.config_cache import ConfigCache
            return ConfigCache.get_instance().get_system_setting(key)
        except Exception:
            return None

    def _get_or_create(self, category: str, provider_name: str) -> object:
        """Load and cache a provider instance by category and name."""
        cache_key = (category, provider_name)
        if cache_key in self._cache:
            return self._cache[cache_key]

        registry = _CATEGORY_REGISTRIES.get(category)
        if registry is None:
            raise ValueError(f"Unknown provider category: '{category}'")

        entry = registry.get(provider_name)
        if entry is None:
            raise ValueError(
                f"Unknown provider '{provider_name}' for category '{category}'. "
                f"Available: {list(registry.keys())}"
            )

        module_path, class_name = entry
        try:
            import importlib
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            instance = cls()
            self._cache[cache_key] = instance
            logger.info(
                f"ProviderResolver: instantiated {class_name} "
                f"for category='{category}'"
            )
            return instance
        except Exception as exc:
            raise ValueError(
                f"Failed to load provider '{provider_name}' "
                f"({module_path}.{class_name}): {exc}"
            ) from exc
