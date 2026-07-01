"""
LLM Adapter - Integrates with multiple LLM providers for task execution.
Supports: OpenRouter, OpenAI, Anthropic, and OpenCode-compatible APIs.
Falls back through providers in priority order based on available API keys.
"""

import asyncio
import httpx
import logging
import os
import json
from typing import Optional, Dict, Any, List, AsyncIterator

logger = logging.getLogger(__name__)


class LLMProvider:
    """Configuration for a single LLM provider."""

    def __init__(self, name: str, api_base: str, api_key: str,
                 default_model: str, header_format: str = "bearer"):
        self.name = name
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.default_model = default_model
        self.header_format = header_format  # "bearer" or "x-api-key"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key not in (
            "", "your_openai_api_key_here", "your_anthropic_api_key_here",
            "your_openrouter_api_key_here", "your_o...here",
        ))

    def get_headers(self) -> dict:
        if self.header_format == "x-api-key":
            return {
                "x-api-key": self.api_key,
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
            }
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }


class OpenCodeAdapter:
    """
    Multi-provider LLM adapter. Tries providers in priority order:
    1. OpenRouter (access to 300+ models, OpenAI-compatible API)
    2. OpenAI (direct)
    3. Anthropic (direct, uses messages API)
    4. OpenCode (custom OpenAI-compatible endpoint)

    The first provider with a valid API key is used. Each provider is tried
    in order, and on failure the next provider is attempted.
    """

    def __init__(self):
        # Detect available providers
        self.providers: List[LLMProvider] = []

        # OpenRouter - highest priority (universal access)
        openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
        if openrouter_key and self._is_valid_key(openrouter_key):
            self.providers.append(LLMProvider(
                name="openrouter",
                api_base="https://openrouter.ai/api/v1",
                api_key=openrouter_key,
                default_model="anthropic/claude-sonnet-4",
            ))

        # OpenAI
        openai_key = os.getenv("OPENAI_API_KEY", "")
        if openai_key and self._is_valid_key(openai_key):
            self.providers.append(LLMProvider(
                name="openai",
                api_base="https://api.openai.com/v1",
                api_key=openai_key,
                default_model="gpt-4o",
            ))

        # Anthropic
        anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
        if anthropic_key and self._is_valid_key(anthropic_key):
            self.providers.append(LLMProvider(
                name="anthropic",
                api_base="https://api.anthropic.com/v1",
                api_key=anthropic_key,
                default_model="claude-sonnet-4-20250514",
                header_format="x-api-key",
            ))

        # OpenCode (custom OpenAI-compatible endpoint)
        opencode_key = os.getenv("OPENCODE_API_KEY", "")
        opencode_url = os.getenv("OPENCODE_API_URL", "")
        if opencode_key and opencode_url and self._is_valid_key(opencode_key):
            self.providers.append(LLMProvider(
                name="opencode",
                api_base=opencode_url,
                api_key=opencode_key,
                default_model="minimax-m3",
            ))

        # Log which providers are available
        provider_names = [p.name for p in self.providers]
        if provider_names:
            logger.info("LLM providers available: %s", ", ".join(provider_names))
        else:
            logger.warning(
                "No LLM providers configured! Set one of: "
                "OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, "
                "or OPENCODE_API_KEY + OPENCODE_API_URL"
            )

        # Default model rates for cost tracking
        self.model_rates = {
            "minimax-m3": {"input": 0.001, "output": 0.002},
            "minimax-m2.7": {"input": 0.001, "output": 0.002},
            "minimax-m2.5": {"input": 0.001, "output": 0.002},
            "kimi-k2.7-code": {"input": 0.002, "output": 0.006},
            "kimi-k2.6": {"input": 0.002, "output": 0.006},
            "kimi-k2.5": {"input": 0.002, "output": 0.006},
            "glm-5.2": {"input": 0.001, "output": 0.002},
            "glm-5.1": {"input": 0.001, "output": 0.002},
            "glm-5": {"input": 0.001, "output": 0.002},
            "deepseek-v4-pro": {"input": 0.002, "output": 0.006},
            "deepseek-v4-flash": {"input": 0.001, "output": 0.002},
            "qwen3.7-max": {"input": 0.002, "output": 0.006},
            "qwen3.7-plus": {"input": 0.001, "output": 0.003},
            "qwen3.6-plus": {"input": 0.001, "output": 0.003},
            "qwen3.5-plus": {"input": 0.001, "output": 0.002},
            "mimo-v2-pro": {"input": 0.002, "output": 0.006},
            "mimo-v2-omni": {"input": 0.002, "output": 0.006},
            "mimo-v2.5-pro": {"input": 0.002, "output": 0.006},
            "mimo-v2.5": {"input": 0.001, "output": 0.003},
            "hy3-preview": {"input": 0.001, "output": 0.003},
            "gpt-4o": {"input": 0.005, "output": 0.015},
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "gpt-4-turbo": {"input": 0.01, "output": 0.03},
            "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
            "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
            "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
            "claude-3-5-haiku-20241022": {"input": 0.001, "output": 0.005},
        }

        # Task execution tracking
        self.active_tasks: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def _is_valid_key(key: str) -> bool:
        """Check if an API key looks like a real key (not a placeholder)."""
        key = key.strip()
        if not key:
            return False
        # Reject common placeholder patterns
        placeholders = {
            "", "your_openai_api_key_here", "your_anthropic_api_key_here",
            "your_openrouter_api_key_here", "your_opencode_api_key_here",
            "your_key_here", "xxx", "changeme", "test", "placeholder",
            "sk-xxx", "sk-ant-xxx", "sk-or-xxx",
        }
        if key.lower() in placeholders:
            return False
        # Must be at least 10 chars (real keys are much longer)
        if len(key) < 10:
            return False
        # Check for placeholder patterns
        if key.startswith("your_") and key.endswith("_here"):
            return False
        return True

    def _resolve_model(self, requested_model: str, provider: LLMProvider) -> str:
        """Resolve the model name for a given provider."""
        # If the model name looks like it belongs to the provider's ecosystem, use it
        if provider.name == "anthropic":
            # For Anthropic, use Claude models
            if "claude" in requested_model.lower() or requested_model in (
                "minimax-m3", "minimax-m2.7", "minimax-m2.5"
            ):
                return provider.default_model
            return requested_model

        if provider.name == "openai":
            # For OpenAI, use GPT models
            if requested_model in ("minimax-m3", "minimax-m2.7", "minimax-m2.5",
                                    "kimi-k2.7-code", "deepseek-v4-pro",
                                    "mimo-v2.5-pro"):
                return provider.default_model
            return requested_model

        # For OpenRouter and OpenCode, use the model name as-is
        return requested_model

    async def _call_openai_compatible(
        self,
        provider: LLMProvider,
        messages: list,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> Dict[str, Any]:
        """Call an OpenAI-compatible API (OpenRouter, OpenAI, OpenCode)."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{provider.api_base}/chat/completions",
                headers=provider.get_headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )

            if response.status_code != 200:
                raise Exception(
                    f"{provider.name} API error: {response.status_code} - "
                    f"{response.text[:500]}"
                )

            # Validate response is valid JSON before parsing
            response_text = response.text.strip()
            if not response_text:
                raise Exception(
                    f"{provider.name} API returned empty response (HTTP 200). "
                    f"The endpoint {provider.api_base} may be misconfigured or down."
                )

            try:
                result = response.json()
            except Exception:
                raise Exception(
                    f"{provider.name} API returned non-JSON response: "
                    f"'{response_text[:200]}'. The endpoint may be incorrect "
                    f"(got {provider.api_base}/chat/completions)."
                )

            # Validate response structure
            choices = result.get("choices")
            if not choices or not isinstance(choices, list) or len(choices) == 0:
                raise Exception(
                    f"{provider.name} API returned no choices in response. "
                    f"Response: {str(result)[:300]}"
                )

            content = (
                choices[0]
                .get("message", {})
                .get("content", "")
            )
            if not content:
                raise Exception(
                    f"{provider.name} API returned empty content. "
                    f"Model '{model}' may not be available on this provider."
                )

            usage = result.get("usage", {})
            return {
                "content": content,
                "input_tokens": usage.get("prompt_tokens", 0),
                "output_tokens": usage.get("completion_tokens", 0),
            }

    async def _call_anthropic(
        self,
        provider: LLMProvider,
        messages: list,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> Dict[str, Any]:
        """Call the Anthropic Messages API."""
        # Extract system prompt from messages
        system_text = ""
        api_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_text = msg["content"]
            else:
                api_messages.append(msg)

        payload = {
            "model": model,
            "messages": api_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if system_text:
            payload["system"] = system_text

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{provider.api_base}/messages",
                headers=provider.get_headers(),
                json=payload,
            )

            if response.status_code != 200:
                raise Exception(
                    f"Anthropic API error: {response.status_code} - "
                    f"{response.text[:500]}"
                )

            result = response.json()
            content = ""
            for block in result.get("content", []):
                if block.get("type") == "text":
                    content += block.get("text", "")

            usage = result.get("usage", {})
            return {
                "content": content,
                "input_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
            }

    async def _call_provider(
        self,
        provider: LLMProvider,
        messages: list,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> Dict[str, Any]:
        """Route to the correct API call based on provider type."""
        resolved_model = self._resolve_model(model, provider)

        if provider.name == "anthropic":
            return await self._call_anthropic(
                provider, messages, resolved_model, temperature, max_tokens
            )
        else:
            return await self._call_openai_compatible(
                provider, messages, resolved_model, temperature, max_tokens
            )

    async def execute_task(
        self,
        task_id: str,
        prompt: str,
        model: str = "minimax-m3",
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        messages: Optional[List[Dict[str, str]]] = None,
        callback=None,
    ) -> Dict[str, Any]:
        """
        Execute a task via the best available LLM provider.

        Args:
            task_id: Unique task identifier
            prompt: Task description/prompt (used if messages is None)
            model: Preferred model name
            system_prompt: Optional system prompt (used if messages is None)
            temperature: Temperature for generation
            max_tokens: Maximum tokens to generate
            messages: Full messages array (overrides prompt/system_prompt if provided)
            callback: Optional callback for progress updates

        Returns:
            Dict with task result, tokens used, cost, etc.
        """
        logger.info("Executing task %s with model %s", task_id, model)

        # Track active task
        self.active_tasks[task_id] = {
            "status": "running",
            "model": model,
            "started_at": asyncio.get_event_loop().time(),
        }

        # Build messages array
        if messages:
            llm_messages = messages
        else:
            llm_messages = []
            if system_prompt:
                llm_messages.append({"role": "system", "content": system_prompt})
            llm_messages.append({"role": "user", "content": prompt})

        if not self.providers:
            error_msg = (
                "No LLM providers configured. Set one of: OPENROUTER_API_KEY, "
                "OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENCODE_API_KEY + "
                "OPENCODE_API_URL in your .env file."
            )
            logger.error(error_msg)
            self.active_tasks[task_id]["status"] = "failed"
            self.active_tasks[task_id]["error"] = error_msg
            return {"success": False, "error": error_msg, "model": model}

        # Try each provider in order
        last_error = None
        for provider in self.providers:
            try:
                logger.info(
                    "Trying provider %s for task %s", provider.name, task_id
                )
                result = await self._call_provider(
                    provider, llm_messages, model, temperature, max_tokens
                )

                content = result["content"]
                input_tokens = result["input_tokens"]
                output_tokens = result["output_tokens"]

                # Calculate cost
                rates = self.model_rates.get(model, {"input": 0.002, "output": 0.006})
                cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1000

                # Update task status
                self.active_tasks[task_id]["status"] = "completed"
                self.active_tasks[task_id]["completed_at"] = asyncio.get_event_loop().time()
                self.active_tasks[task_id]["provider"] = provider.name

                logger.info(
                    "Task %s completed via %s: %d input + %d output tokens, $%.4f",
                    task_id, provider.name, input_tokens, output_tokens, cost,
                )

                return {
                    "success": True,
                    "content": content,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost": cost,
                    "model": model,
                    "provider": provider.name,
                    "duration": (
                        self.active_tasks[task_id]["completed_at"]
                        - self.active_tasks[task_id]["started_at"]
                    ),
                }

            except Exception as e:
                last_error = str(e)
                logger.warning(
                    "Provider %s failed for task %s: %s",
                    provider.name, task_id, last_error,
                )
                continue

        # All providers failed
        logger.error("All LLM providers failed for task %s", task_id)
        self.active_tasks[task_id]["status"] = "failed"
        self.active_tasks[task_id]["error"] = last_error or "All providers failed"

        return {
            "success": False,
            "error": last_error or "All LLM providers failed",
            "model": model,
        }

    async def _stream_openai_compatible(
        self,
        provider: LLMProvider,
        messages: list,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[str]:
        """Stream an OpenAI-compatible API token by token."""
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
            async with client.stream(
                "POST",
                f"{provider.api_base}/chat/completions",
                headers=provider.get_headers(),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True,
                },
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise Exception(
                        f"{provider.name} streaming API error: {response.status_code} - "
                        f"{body.decode()[:500]}"
                    )
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                if content:
                                    yield content
                        except json.JSONDecodeError:
                            continue

    async def _stream_anthropic(
        self,
        provider: LLMProvider,
        messages: list,
        model: str,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[str]:
        """Stream from the Anthropic Messages API."""
        system_text = ""
        api_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_text = msg["content"]
            else:
                api_messages.append(msg)

        payload: Dict[str, Any] = {
            "model": model,
            "messages": api_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if system_text:
            payload["system"] = system_text

        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0)) as client:
            async with client.stream(
                "POST",
                f"{provider.api_base}/messages",
                headers=provider.get_headers(),
                json=payload,
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise Exception(
                        f"Anthropic streaming API error: {response.status_code} - "
                        f"{body.decode()[:500]}"
                    )
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            event = json.loads(data_str)
                            event_type = event.get("type", "")
                            if event_type == "content_block_delta":
                                delta = event.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    text = delta.get("text", "")
                                    if text:
                                        yield text
                            elif event_type == "message_stop":
                                break
                        except json.JSONDecodeError:
                            continue

    async def stream_chat(
        self,
        messages: list,
        model: str = "minimax-m3",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """
        Stream chat response token by token from the best available provider.
        Tries providers in order. Yields text chunks as they arrive.
        """
        if not self.providers:
            raise Exception(
                "No LLM providers configured. Set one of: OPENROUTER_API_KEY, "
                "OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENCODE_API_KEY + "
                "OPENCODE_API_URL in your .env file."
            )

        last_error = None
        for provider in self.providers:
            try:
                logger.info("Streaming via provider %s with model %s", provider.name, model)
                resolved_model = self._resolve_model(model, provider)
                if provider.name == "anthropic":
                    async for chunk in self._stream_anthropic(
                        provider, messages, resolved_model, temperature, max_tokens
                    ):
                        yield chunk
                else:
                    async for chunk in self._stream_openai_compatible(
                        provider, messages, resolved_model, temperature, max_tokens
                    ):
                        yield chunk
                return  # Success — stop trying providers
            except Exception as e:
                last_error = str(e)
                logger.warning("Streaming via %s failed: %s", provider.name, last_error)
                continue

        raise Exception(last_error or "All LLM providers failed for streaming")

    def stop_task(self, task_id: str) -> bool:
        """Stop a running task."""
        if task_id in self.active_tasks:
            self.active_tasks[task_id]["status"] = "stopped"
            logger.info("Task %s stopped", task_id)
            return True
        return False

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a task."""
        return self.active_tasks.get(task_id)

    def get_model_rates(self, model: str) -> Dict[str, float]:
        """Get token rates for a model."""
        return self.model_rates.get(model, {"input": 0.002, "output": 0.006})

    def list_models(self) -> list:
        """List available models."""
        return list(self.model_rates.keys())

    def get_available_providers(self) -> List[str]:
        """Return list of configured provider names."""
        return [p.name for p in self.providers]


# Singleton instance
opencode_adapter = OpenCodeAdapter()
