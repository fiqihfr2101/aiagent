"""
Knowledge Bridge: Thin layer on top of MemoryManager that injects
relevant knowledge into LLM system prompts before agents respond.

Queries both private (agent-specific) and shared memories from ChromaDB,
formats them into a structured context block, and enhances system prompts.
"""

import re
import logging
from typing import Optional, List, Dict, Any

from app.infrastructure.memory_manager import MemoryManager

logger = logging.getLogger(__name__)

# Singleton instance
_bridge_instance: Optional["KnowledgeBridge"] = None


def get_knowledge_bridge(memory_manager: Optional[MemoryManager] = None) -> "KnowledgeBridge":
    """Get or create the singleton KnowledgeBridge instance."""
    global _bridge_instance
    if _bridge_instance is None:
        if memory_manager is None:
            memory_manager = MemoryManager()
        _bridge_instance = KnowledgeBridge(memory_manager)
    return _bridge_instance


class KnowledgeBridge:
    """
    Bridges ChromaDB memory store with the LLM chat pipeline.
    
    Before an agent responds, KnowledgeBridge queries for relevant memories
    and injects them as context into the system prompt.
    """

    def __init__(self, memory_manager: MemoryManager):
        self.mm = memory_manager

    # ── Core Methods ──────────────────────────────────────────────

    async def get_context_for_agent(
        self,
        agent_id: str,
        query: str,
        max_memories: int = 5,
    ) -> str:
        """
        Query the knowledge base for memories relevant to the user's query.
        
        Searches both agent-specific (private) and shared memories,
        then formats the top results into a structured context string.
        
        Returns an empty string if no relevant memories are found.
        """
        if not query or not query.strip():
            return ""

        try:
            # Search agent's private memories + shared pool
            results = await self.mm.semantic_search(
                query_text=query,
                agent_id=agent_id,
                include_shared=True,
                include_archived=False,
                n_results=max_memories * 2,  # Over-fetch to allow filtering
            )
        except Exception as e:
            logger.warning("KnowledgeBridge search failed for agent %s: %s", agent_id, e)
            return ""

        if not results:
            return ""

        # Filter by minimum relevance threshold and take top N
        # Use a low threshold to avoid missing useful context
        MIN_RELEVANCE = 0.25
        filtered = [r for r in results if r.get("relevance", 0) >= MIN_RELEVANCE]
        filtered.sort(key=lambda x: x["relevance"] * x.get("importance", 0.5), reverse=True)
        top = filtered[:max_memories]

        if not top:
            return ""

        return self._format_context(top)

    async def get_enhanced_system_prompt(
        self,
        agent_id: str,
        query: str,
        base_system_prompt: str,
        max_memories: int = 5,
    ) -> str:
        """
        Enhance a base system prompt with relevant knowledge context.
        
        If no relevant memories are found, returns the base prompt unchanged.
        """
        context = await self.get_context_for_agent(agent_id, query, max_memories)

        if not context:
            return base_system_prompt

        return (
            base_system_prompt
            + "\n\n"
            + context
            + "\n\nUse the above knowledge from your memory to inform your response. "
            "If the knowledge is relevant, incorporate it naturally. "
            "If it's not relevant to the current question, ignore it."
        )

    async def auto_store_conversation(
        self,
        agent_id: str,
        user_msg: str,
        agent_response: str,
    ) -> Optional[dict]:
        """
        Selectively extract and store important facts from a conversation.
        
        Only stores memories when meaningful content is detected:
        - Technical decisions or architecture choices
        - Explicit facts, definitions, or specifications
        - Procedures or step-by-step instructions
        - Important context or constraints mentioned
        
        Returns the stored memory dict if one was created, None otherwise.
        """
        if not self._should_store(user_msg, agent_response):
            return None

        # Extract a title and body from the conversation
        title = self._extract_title(user_msg, agent_response)
        body = self._extract_body(user_msg, agent_response)
        mem_type = self._classify_memory(user_msg, agent_response)
        importance = self._estimate_importance(user_msg, agent_response)

        if not title or not body:
            return None

        try:
            result = await self.mm.add_memory(
                agent_id=agent_id,
                mem_type=mem_type,
                title=title,
                body=body,
                importance=importance,
                shared=False,
                source_agent_id=agent_id,
            )
            logger.info(
                "Auto-stored memory for agent %s: [%s] %s (importance=%.2f)",
                agent_id, mem_type, title, importance,
            )
            return result
        except Exception as e:
            logger.warning("Failed to auto-store memory for agent %s: %s", agent_id, e)
            return None

    # ── Formatting ────────────────────────────────────────────────

    def _format_context(self, memories: List[Dict[str, Any]]) -> str:
        """Format memories into a structured context block for the LLM."""
        lines = ["## Relevant Knowledge from Memory", ""]

        type_labels = {
            "fact": "fact",
            "proc": "procedure",
            "ctx": "context",
            "ref": "reference",
        }

        for mem in memories:
            mem_type = type_labels.get(mem.get("type", "fact"), "fact")
            title = mem.get("title", "Untitled")
            body = mem.get("body", "").strip()
            relevance = mem.get("relevance", 0)
            shared = mem.get("shared", False)
            agent_id = mem.get("agent_id", "unknown")

            # Truncate very long memory bodies for prompt injection
            if len(body) > 500:
                body = body[:497] + "..."

            source_tag = " (shared)" if shared else ""
            lines.append(f"### [{mem_type}] {title} (relevance: {relevance:.2f}){source_tag}")

            # Indent body for readability
            for body_line in body.split("\n"):
                lines.append(body_line)

            lines.append("")

        return "\n".join(lines).strip()

    # ── Selective Storage Heuristics ──────────────────────────────

    def _should_store(self, user_msg: str, agent_response: str) -> bool:
        """
        Determine if a conversation contains enough meaningful content
        to be worth storing as a memory.
        
        Avoids storing:
        - Very short exchanges
        - Greetings and pleasantries
        - Error messages or "I don't know" responses
        """
        # Skip very short exchanges
        if len(agent_response) < 80:
            return False

        # Skip greetings / pleasantries
        greeting_patterns = [
            r"^(hi|hello|hey|how are you|good morning|good evening)",
            r"^(thanks|thank you|bye|goodbye|see you)",
        ]
        user_lower = user_msg.lower().strip()
        for pat in greeting_patterns:
            if re.match(pat, user_lower):
                return False

        # Skip error / fallback responses
        if "LLM service encountered an error" in agent_response:
            return False
        if "configure an API key" in agent_response:
            return False

        # Store if the response is substantial (likely contains useful info)
        if len(agent_response) > 300:
            return True

        # Store if the conversation mentions technical terms
        tech_indicators = [
            "api", "database", "endpoint", "component", "function",
            "class", "method", "config", "deploy", "test", "schema",
            "migration", "authentication", "jwt", "token", "docker",
            "redis", "cache", "query", "model", "route", "middleware",
        ]
        combined = (user_msg + " " + agent_response).lower()
        tech_count = sum(1 for t in tech_indicators if t in combined)
        if tech_count >= 2:
            return True

        return False

    def _extract_title(self, user_msg: str, agent_response: str) -> str:
        """Extract a concise title from the conversation."""
        # Try to find a topic from the user's question
        user_clean = user_msg.strip()

        # Remove common prefixes
        user_clean = re.sub(r"^(please|can you|could you|how do i|how to|what is|what's)\s+", "", user_clean, flags=re.IGNORECASE)

        # Take first sentence or first 80 chars
        first_sentence = re.split(r"[.?!]\s", user_clean)[0]
        title = first_sentence[:80].strip()

        if not title:
            title = user_clean[:80].strip()

        return title if title else "Conversation knowledge"

    def _extract_body(self, user_msg: str, agent_response: str) -> str:
        """Extract the knowledge body from the conversation."""
        # Prefer the agent's response as it contains the knowledge
        # But include the user's question for context
        body_parts = []

        # Short context of what was asked
        if len(user_msg) > 150:
            body_parts.append(f"Q: {user_msg[:150]}...")
        else:
            body_parts.append(f"Q: {user_msg}")

        # The agent's knowledge-rich response (cap at 1000 chars)
        response = agent_response.strip()
        if len(response) > 1000:
            response = response[:997] + "..."
        body_parts.append(response)

        return "\n\n".join(body_parts)

    def _classify_memory(self, user_msg: str, agent_response: str) -> str:
        """Classify the memory type based on conversation content."""
        combined = (user_msg + " " + agent_response).lower()

        # Procedure indicators
        proc_patterns = [
            r"\b(step \d|first.*then|how to|instructions|process|workflow)\b",
            r"\b(\d+\.\s|-\s.*-\s|run.*then)\b",
        ]
        for pat in proc_patterns:
            if re.search(pat, combined):
                return "proc"

        # Context indicators
        ctx_patterns = [
            r"\b(currently|right now|at the moment|this project|our setup)\b",
            r"\b(using|we use|configured|set up|running)\b",
        ]
        for pat in ctx_patterns:
            if re.search(pat, combined):
                return "ctx"

        # Reference indicators
        ref_patterns = [
            r"\b(documentation|reference|link|url|see also|according to)\b",
            r"\b(specification|standard|rfc|guide)\b",
        ]
        for pat in ref_patterns:
            if re.search(pat, combined):
                return "ref"

        # Default to fact
        return "fact"

    def _estimate_importance(self, user_msg: str, agent_response: str) -> float:
        """Estimate memory importance on a 0.0-1.0 scale."""
        score = 0.5  # Baseline

        combined = (user_msg + " " + agent_response).lower()

        # Boost for explicit importance markers
        if any(w in combined for w in ["important", "critical", "must", "required", "always", "never"]):
            score += 0.15

        # Boost for architectural / design decisions
        if any(w in combined for w in ["architecture", "design pattern", "decision", "trade-off", "chosen"]):
            score += 0.1

        # Boost for security-related content
        if any(w in combined for w in ["security", "auth", "permission", "encrypt", "token", "secret"]):
            score += 0.1

        # Boost for longer, more detailed responses
        if len(agent_response) > 500:
            score += 0.1
        elif len(agent_response) > 1000:
            score += 0.15

        return min(1.0, max(0.3, score))

    # ── Stats ─────────────────────────────────────────────────────

    async def get_stats(self, agent_id: Optional[str] = None) -> dict:
        """Get knowledge base statistics."""
        if agent_id:
            return await self.mm.get_stats(agent_id)

        # Aggregate stats across all agents
        try:
            all_private = self.mm.collection.get()
            all_shared = self.mm.shared_pool.get()

            private_count = len(all_private["ids"]) if all_private["ids"] else 0
            shared_count = len(all_shared["ids"]) if all_shared["ids"] else 0

            # Count active (non-archived) memories
            active_private = self.mm.collection.get(where={"archived": False})
            active_shared = self.mm.shared_pool.get(where={"archived": False})
            active_count = (
                len(active_private["ids"] if active_private["ids"] else [])
                + len(active_shared["ids"] if active_shared["ids"] else [])
            )

            # Get unique agent IDs
            agent_ids = set()
            if all_private["metadatas"]:
                for meta in all_private["metadatas"]:
                    agent_ids.add(meta.get("agent_id", "unknown"))

            return {
                "total_memories": private_count + shared_count,
                "private_memories": private_count,
                "shared_memories": shared_count,
                "active_memories": active_count,
                "agents_with_knowledge": len(agent_ids),
                "agent_ids": sorted(agent_ids),
            }
        except Exception as e:
            logger.warning("Failed to get knowledge stats: %s", e)
            return {
                "total_memories": 0,
                "private_memories": 0,
                "shared_memories": 0,
                "active_memories": 0,
                "agents_with_knowledge": 0,
                "agent_ids": [],
                "error": str(e),
            }
