"""
shared/providers/llm/llm_groq.py — Groq LLM provider.

Implementation:
    Model: llama-3.1-70b-versatile (default fallback)
    API: POST https://api.groq.com/openai/v1/chat/completions
"""

import os
import httpx

from shared.providers.base.llm_provider import LLMProvider
from shared.exceptions.pipeline_exceptions import ProviderError
from shared.utils.logging import get_logger

logger = get_logger("shared.providers.llm.groq")


class LLMGroq(LLMProvider):
    """Groq LLM implementation (used as alternate/fallback)."""

    def __init__(self) -> None:
        self.api_key = os.environ.get("GROQ_API_KEY")
        if not self.api_key:
            raise EnvironmentError("GROQ_API_KEY not set")
        self.model = os.environ.get("GROQ_MODEL", "llama-4-scout-17b-16e-instruct")
        self.url = "https://api.groq.com/openai/v1/chat/completions"

    @property
    def provider_name(self) -> str:
        return "groq"

    async def chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> str:
        """Generate a response using Groq API (OpenAI compatible)."""
        logger.debug(f"LLM Groq: Prompt length={len(user_prompt)}")

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.url,
                    headers=headers,
                    json=payload
                )

            if response.status_code != 200:
                raise ProviderError(
                    self.provider_name,
                    f"Groq LLM failed: {response.status_code} - {response.text}"
                )

            result = response.json()
            answer = result["choices"][0]["message"]["content"].strip()
            
            logger.info("LLM Groq: Success.")
            return answer

        except (httpx.RequestError, KeyError, IndexError) as exc:
            raise ProviderError(self.provider_name, f"LLM error: {exc}")
        except Exception as exc:
            if isinstance(exc, ProviderError):
                raise
            raise ProviderError(self.provider_name, f"Unexpected error: {exc}")
