"""
OpenCode Adapter - Integrates with OpenCode API for task execution.
Connects dashboard agents to OpenCode models for actual AI task execution.
"""

import asyncio
import httpx
import logging
import os
import json
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class OpenCodeAdapter:
    """Adapter to execute tasks via OpenCode API."""
    
    def __init__(self):
        # OpenCode API configuration
        self.api_base = os.getenv("OPENCODE_API_URL", "https://api.opencode.ai/v1")
        self.api_key = os.getenv("OPENCODE_API_KEY", "")
        
        # Default model rates (can be overridden)
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
        }
        
        # Task execution tracking
        self.active_tasks: Dict[str, Dict[str, Any]] = {}
    
    async def execute_task(
        self,
        task_id: str,
        prompt: str,
        model: str = "minimax-m3",
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        callback=None
    ) -> Dict[str, Any]:
        """
        Execute a task via OpenCode API.
        
        Args:
            task_id: Unique task identifier
            prompt: Task description/prompt
            model: Model to use (e.g., deepseek-v4-pro)
            system_prompt: Optional system prompt
            temperature: Temperature for generation
            max_tokens: Maximum tokens to generate
            callback: Optional callback for progress updates
        
        Returns:
            Dict with task result, tokens used, cost, etc.
        """
        logger.info(f"Executing task {task_id} with model {model}")
        
        # Track active task
        self.active_tasks[task_id] = {
            "status": "running",
            "model": model,
            "started_at": asyncio.get_event_loop().time()
        }
        
        try:
            # Prepare messages
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})
            
            # Call OpenCode API
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    }
                )
                
                if response.status_code != 200:
                    raise Exception(f"OpenCode API error: {response.status_code} - {response.text}")
                
                result = response.json()
                
                # Extract response
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                usage = result.get("usage", {})
                input_tokens = usage.get("prompt_tokens", 0)
                output_tokens = usage.get("completion_tokens", 0)
                
                # Calculate cost
                rates = self.model_rates.get(model, {"input": 0.002, "output": 0.006})
                cost = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1000
                
                # Update task status
                self.active_tasks[task_id]["status"] = "completed"
                self.active_tasks[task_id]["completed_at"] = asyncio.get_event_loop().time()
                
                logger.info(f"Task {task_id} completed: {input_tokens} input + {output_tokens} output tokens, ${cost:.4f}")
                
                return {
                    "success": True,
                    "content": content,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost": cost,
                    "model": model,
                    "duration": self.active_tasks[task_id]["completed_at"] - self.active_tasks[task_id]["started_at"]
                }
                
        except Exception as e:
            logger.error(f"Task {task_id} failed: {str(e)}")
            self.active_tasks[task_id]["status"] = "failed"
            self.active_tasks[task_id]["error"] = str(e)
            
            return {
                "success": False,
                "error": str(e),
                "model": model
            }
    
    def stop_task(self, task_id: str) -> bool:
        """Stop a running task."""
        if task_id in self.active_tasks:
            self.active_tasks[task_id]["status"] = "stopped"
            logger.info(f"Task {task_id} stopped")
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


# Singleton instance
opencode_adapter = OpenCodeAdapter()
