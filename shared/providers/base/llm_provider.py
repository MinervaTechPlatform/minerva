"""
shared/providers/base/llm_provider.py — LLM provider interface.

Purpose:
    Abstract base class that all LLM providers must implement.

Interface:
    class LLMProvider(ABC):
        def chat_completion(self, system_prompt: str, user_prompt: str,
                          temperature: float, max_tokens: int) -> str
            Returns: generated text response

        def chat_completion_stream(self, system_prompt: str, user_prompt: str,
                                   temperature: float, max_tokens: int) -> AsyncIterator[str]
            Yields: text delta chunks as they arrive from the model
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMProvider(ABC):
    """Abstract base class for all LLM provider implementations."""

    @abstractmethod
    async def chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> str:
        """
        Generate a text response from the LLM.

        Args:
            system_prompt: The system instruction / persona.
            user_prompt:   The user query with injected context.
            temperature:   Sampling temperature (0.0 for deterministic).
            max_tokens:    Maximum tokens in the response.

        Returns:
            The model's text response, stripped of leading/trailing whitespace.

        Raises:
            ProviderError: If the API call fails.
        """
        ...

    async def chat_completion_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> AsyncIterator[str]:
        """
        Stream text delta chunks from the LLM.

        Default implementation falls back to non-streaming chat_completion,
        yielding the full response as a single chunk. Override in subclasses
        for true token-level streaming.

        Yields:
            Text delta strings as they arrive.
        """
        result = await self.chat_completion(system_prompt, user_prompt, temperature, max_tokens)
        yield result

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the canonical provider name (e.g. 'sarvam', 'openai')."""
        ...
