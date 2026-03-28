"""
shared/providers/llm/llm_sarvam.py — Sarvam AI LLM provider.

Implementation:
    Model: sarvam-m
    API: POST https://api.sarvam.ai/v1/chat/completions
"""

import json
import os
from typing import AsyncIterator

import httpx

from shared.providers.base.llm_provider import LLMProvider
from shared.exceptions.pipeline_exceptions import ProviderError
from shared.utils.logging import get_logger

logger = get_logger("shared.providers.llm.sarvam")


class LLMSarvam(LLMProvider):
    """Sarvam AI LLM implementation."""

    def __init__(self) -> None:
        self.api_key = os.environ.get("SARVAM_API_KEY")
        if not self.api_key:
            raise EnvironmentError("SARVAM_API_KEY not set")
        self.url = "https://api.sarvam.ai/v1/chat/completions"

    @property
    def provider_name(self) -> str:
        return "sarvam"

    def _build_payload(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        stream: bool = False,
    ) -> dict:
        return {
            "model": "sarvam-m",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }

    def _headers(self) -> dict:
        return {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json",
        }

    async def chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> str:
        """Generate a response using Sarvam multilingual LLM."""
        logger.debug(f"LLM Sarvam: Prompt length={len(user_prompt)}")

        payload = self._build_payload(system_prompt, user_prompt, temperature, max_tokens)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(self.url, headers=self._headers(), json=payload)

            if response.status_code != 200:
                raise ProviderError(
                    self.provider_name,
                    f"Sarvam LLM failed: {response.status_code} - {response.text}",
                )

            result = response.json()
            answer = result["choices"][0]["message"]["content"].strip()
            logger.info("LLM Sarvam: Success.")
            return answer

        except (httpx.RequestError, KeyError, IndexError) as exc:
            raise ProviderError(self.provider_name, f"LLM error: {exc}")
        except Exception as exc:
            if isinstance(exc, ProviderError):
                raise
            raise ProviderError(self.provider_name, f"Unexpected error: {exc}")

    async def chat_completion_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 500,
    ) -> AsyncIterator[str]:
        """Stream token deltas from Sarvam using SSE."""
        logger.debug(f"LLM Sarvam stream: Prompt length={len(user_prompt)}")

        payload = self._build_payload(system_prompt, user_prompt, temperature, max_tokens, stream=True)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST", self.url, headers=self._headers(), json=payload
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        raise ProviderError(
                            self.provider_name,
                            f"Sarvam stream failed: {response.status_code} - {body.decode()}",
                        )

                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[len("data:"):].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            delta = chunk["choices"][0]["delta"].get("content", "")
                            if delta:
                                yield delta
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

        except (httpx.RequestError,) as exc:
            raise ProviderError(self.provider_name, f"LLM stream error: {exc}")
        except Exception as exc:
            if isinstance(exc, ProviderError):
                raise
            raise ProviderError(self.provider_name, f"Unexpected stream error: {exc}")
