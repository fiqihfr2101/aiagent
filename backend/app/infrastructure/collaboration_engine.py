"""
Multi-Agent Collaboration Engine for AFILABS.

Analyzes complex prompts, decomposes them into sub-tasks,
dispatches to multiple agents in parallel, and combines results.
"""

import asyncio
import logging
import uuid
import re
from typing import Dict, Any, List, Optional

from .orchestrator import AGENT_ROUTES, get_agent_info

logger = logging.getLogger(__name__)

# Keywords/patterns that signal a need for multi-agent collaboration
COLLABORATION_TRIGGERS = [
    "full-stack", "fullstack", "full stack",
    "end-to-end", "e2e",
    "complete feature", "build entire", "build a complete",
    "whole system", "entire system",
    "both frontend and backend", "frontend and backend",
    "api and ui", "api and frontend", "backend and frontend",
    "design and implement", "design and code",
    "plan and build", "plan and implement",
    "frontend, backend", "backend, frontend",
    "ui and api", "ui and backend",
    "design, build, and test",
    "from scratch",
]

# Domain keywords for identifying which agents are needed
DOMAIN_KEYWORDS = {
    "hilman": [
        "plan", "planning", "roadmap", "milestone", "requirement",
        "sprint", "backlog", "scope", "coordinate", "organize",
        "document", "documentation", "prd", "spec",
    ],
    "bahlul": [
        "api", "backend", "database", "server", "endpoint", "route",
        "python", "fastapi", "flask", "django", "node", "express",
        "model", "schema", "migration", "query", "auth", "jwt",
        "redis", "cache", "queue", "celery", "docker", "deploy",
        "rest", "graphql", "grpc", "websocket", "crud",
    ],
    "deden": [
        "frontend", "ui", "react", "nextjs", "next.js", "component",
        "html", "css", "tailwind", "page", "button", "form",
        "dashboard", "typescript", "jsx", "tsx",
        "navigation", "modal", "responsive",
    ],
    "teddy": [
        "design", "figma", "wireframe", "mockup", "prototype",
        "animation", "dark mode", "theme", "color palette",
        "icon", "illustration", "branding", "typography",
        "component library", "design system",
    ],
    "budi": [
        "test", "testing", "qa", "quality", "unit test",
        "integration test", "e2e test", "coverage",
        "cypress", "playwright", "jest", "pytest",
        "ci/cd", "pipeline", "lint", "automation",
    ],
}

# Sub-task templates per agent for common collaboration patterns
SUBTASK_TEMPLATES = {
    "hilman": {
        "default": "Analyze requirements, create a project plan with task breakdown, and define acceptance criteria",
        "fullstack": "Coordinate the full-stack feature development: define requirements, task breakdown for backend and frontend teams, and overall architecture plan",
    },
    "bahlul": {
        "default": "Design and implement backend APIs, database models, and server-side logic",
        "fullstack": "Build the backend API endpoints, database schema, authentication, and server-side logic needed for this feature",
        "auth": "Implement authentication API endpoints (login, register, JWT tokens, middleware)",
    },
    "deden": {
        "default": "Build frontend components, pages, and UI interactions",
        "fullstack": "Create the frontend UI components, pages, and API integration for this feature",
        "auth": "Build the login/register forms, auth state management, and protected route components",
    },
    "teddy": {
        "default": "Design the visual layout, styling, and user experience",
        "fullstack": "Design the UI/UX layout, color scheme, responsive design, and visual polish for this feature",
    },
    "budi": {
        "default": "Write test plans, test cases, and automated tests",
        "fullstack": "Create comprehensive test plan, write unit tests and integration tests for both backend and frontend",
    },
}


class CollaborationEngine:
    """
    Engine that orchestrates multi-agent collaboration.

    Workflow:
    1. Analyze prompt to determine if collaboration is needed
    2. Identify which agents should participate
    3. Generate sub-tasks for each agent
    4. Dispatch sub-tasks in parallel
    5. Combine results into a unified response
    """

    def __init__(self, opencode_adapter):
        self.adapter = opencode_adapter

    def needs_collaboration(self, prompt: str) -> bool:
        """
        Determine if a prompt requires multi-agent collaboration.

        Returns True if:
        - The prompt contains collaboration trigger keywords
        - OR the prompt mentions multiple domain areas (e.g., backend + frontend)
        """
        prompt_lower = prompt.lower()

        # Check for explicit collaboration triggers
        for trigger in COLLABORATION_TRIGGERS:
            if trigger in prompt_lower:
                logger.info("Collaboration trigger found: '%s'", trigger)
                return True

        # Check if multiple agent domains are mentioned
        domains_mentioned = self._identify_domains(prompt)
        if len(domains_mentioned) >= 2:
            logger.info(
                "Multiple domains detected: %s", list(domains_mentioned.keys())
            )
            return True

        return False

    def _identify_domains(self, prompt: str) -> Dict[str, int]:
        """
        Identify which agent domains are relevant to the prompt.
        Returns dict of agent_id -> relevance_score.
        """
        prompt_lower = prompt.lower()
        domain_scores: Dict[str, int] = {}

        for agent_id, keywords in DOMAIN_KEYWORDS.items():
            score = 0
            for kw in keywords:
                if " " in kw:
                    if kw in prompt_lower:
                        score += 2
                else:
                    pattern = r"\b" + re.escape(kw)
                    matches = re.findall(pattern, prompt_lower)
                    score += len(matches) * 2
                    if kw in prompt_lower:
                        score += 1
            if score > 0:
                domain_scores[agent_id] = score

        return domain_scores

    def get_collaborating_agents(self, prompt: str) -> List[str]:
        """
        Return the list of agent IDs that should collaborate on this prompt.
        Always includes 'hilman' as the coordinator.
        """
        domains = self._identify_domains(prompt)

        # Filter to agents with meaningful scores
        threshold = 2
        agents = [aid for aid, score in domains.items() if score >= threshold]

        # Always include hilman as coordinator if more than one agent
        if len(agents) > 1 and "hilman" not in agents:
            agents.insert(0, "hilman")

        # If we only found one agent, try lowering threshold
        if len(agents) <= 1:
            agents = [aid for aid, score in domains.items() if score > 0]
            if len(agents) > 1 and "hilman" not in agents:
                agents.insert(0, "hilman")

        # Default: if still fewer than 2, use hilman + bahlul + deden
        if len(agents) < 2:
            agents = ["hilman", "bahlul", "deden"]

        # Remove duplicates while preserving order
        seen = set()
        unique_agents = []
        for a in agents:
            if a not in seen:
                seen.add(a)
                unique_agents.append(a)

        return unique_agents

    def _generate_subtask(self, agent_id: str, prompt: str) -> str:
        """
        Generate a specific sub-task description for an agent
        based on the original prompt and the agent's role.
        """
        agent_info = get_agent_info(agent_id)
        agent_name = agent_info["name"]
        agent_role = agent_info["role"]

        # Check if we have a relevant template
        prompt_lower = prompt.lower()
        templates = SUBTASK_TEMPLATES.get(agent_id, {})
        template = templates.get("default", f"Handle your part of this request: {prompt[:100]}")

        # Look for more specific templates
        if any(kw in prompt_lower for kw in ["full-stack", "fullstack", "full stack"]):
            template = templates.get("fullstack", template)
        if any(kw in prompt_lower for kw in ["auth", "login", "register"]):
            template = templates.get("auth", template)

        return template

    async def _dispatch_to_agent(
        self,
        agent_id: str,
        subtask: str,
        original_prompt: str,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Dispatch a sub-task to a specific agent via the LLM adapter.
        Returns the agent's response with metadata.
        """
        agent_info = get_agent_info(agent_id)
        agent_name = agent_info["name"]
        agent_role = agent_info["role"]

        # Build system prompt for this agent
        from .orchestrator import get_base_system_prompt
        system_prompt = get_base_system_prompt(agent_id)
        if not system_prompt:
            system_prompt = (
                f"You are {agent_name}, a {agent_role} AI agent. Provide helpful, detailed responses."
            )

        # Enhance the system prompt with collaboration context
        collaboration_context = (
            f"\n\nYou are collaborating with other agents on a complex task. "
            f"Your specific sub-task is: {subtask}\n"
            f"Focus ONLY on your area of expertise ({agent_role}). "
            f"Provide actionable, detailed output that can be combined with other agents' work."
        )
        enhanced_system_prompt = system_prompt + collaboration_context

        # Get model for this agent
        model = "minimax-m3"
        try:
            from app.infrastructure.agent_repository_pg import AgentRepository
            agent_repo = AgentRepository()
            all_agents = agent_repo.get_all()
            for a in all_agents:
                if a["name"].upper() == agent_name.upper():
                    model = a["model"]
                    break
        except Exception as e:
            logger.debug("Could not look up agent model for %s: %s", agent_id, e)

        # Build messages array
        messages = [{"role": "system", "content": enhanced_system_prompt}]
        if history:
            for msg in history[-5:]:
                messages.append(msg)
        messages.append({
            "role": "user",
            "content": f"Original request: {original_prompt}\n\nYour specific task: {subtask}",
        })

        # Call LLM
        try:
            task_id = f"collab_{agent_id}_{uuid.uuid4().hex[:8]}"
            result = await self.adapter.execute_task(
                task_id=task_id,
                prompt=original_prompt,
                model=model,
                system_prompt=enhanced_system_prompt,
                temperature=0.7,
                max_tokens=4096,
                messages=messages,
            )

            if result.get("success") and result.get("content"):
                return {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "agent_role": agent_role,
                    "agent_color": agent_info["color"],
                    "subtask": subtask,
                    "response": result["content"],
                    "success": True,
                    "model": model,
                    "tokens": {
                        "input": result.get("input_tokens", 0),
                        "output": result.get("output_tokens", 0),
                    },
                }
            else:
                error = result.get("error", "Unknown error")
                logger.warning("Agent %s failed: %s", agent_id, error)
                return {
                    "agent_id": agent_id,
                    "agent_name": agent_name,
                    "agent_role": agent_role,
                    "agent_color": agent_info["color"],
                    "subtask": subtask,
                    "response": f"⚠️ {agent_name} encountered an error: {error}",
                    "success": False,
                    "error": error,
                }

        except Exception as e:
            logger.error("Exception dispatching to agent %s: %s", agent_id, e)
            return {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "agent_role": agent_role,
                "agent_color": agent_info["color"],
                "subtask": subtask,
                "response": f"⚠️ {agent_name} failed: {str(e)}",
                "success": False,
                "error": str(e),
            }

    async def collaborate(
        self,
        prompt: str,
        agent_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Execute multi-agent collaboration.

        1. Determine which agents to involve (or use provided agent_ids)
        2. Generate sub-tasks for each agent
        3. Dispatch in parallel via asyncio.gather()
        4. Combine results

        Returns a collaboration result dict.
        """
        # Determine collaborating agents
        if agent_ids:
            agents = agent_ids
        else:
            agents = self.get_collaborating_agents(prompt)

        logger.info(
            "Starting collaboration with agents: %s for prompt: %s",
            agents, prompt[:80],
        )

        # Generate sub-tasks
        subtasks = {}
        for agent_id in agents:
            subtasks[agent_id] = self._generate_subtask(agent_id, prompt)

        # Dispatch all agents in parallel
        tasks = [
            self._dispatch_to_agent(agent_id, subtask, prompt, history)
            for agent_id, subtask in subtasks.items()
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        agent_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                agent_id = agents[i]
                agent_info = get_agent_info(agent_id)
                agent_results.append({
                    "agent_id": agent_id,
                    "agent_name": agent_info["name"],
                    "agent_role": agent_info["role"],
                    "agent_color": agent_info["color"],
                    "subtask": subtasks.get(agent_id, ""),
                    "response": f"⚠️ {agent_info['name']} failed with error: {str(result)}",
                    "success": False,
                    "error": str(result),
                })
            else:
                agent_results.append(result)

        # Build combined response
        combined_response = self._combine_responses(agent_results, prompt)

        return {
            "response": combined_response,
            "collaboration": True,
            "agents": [
                {
                    "id": r["agent_id"],
                    "name": r["agent_name"],
                    "role": r.get("agent_role", ""),
                    "color": r.get("agent_color", "#6B7280"),
                    "subtask": r["subtask"],
                    "response": r["response"],
                    "success": r.get("success", False),
                }
                for r in agent_results
            ],
            "primary_agent": "hilman",
            "agent_count": len(agent_results),
        }

    def _combine_responses(
        self, results: List[Dict[str, Any]], original_prompt: str
    ) -> str:
        """
        Combine multiple agent responses into a single cohesive response.
        """
        sections = []
        sections.append("## 🤝 Multi-Agent Collaboration\n")
        sections.append(
            f"*This response was collaboratively generated by {len(results)} agents.*\n"
        )

        for result in results:
            agent_name = result["agent_name"]
            agent_role = result["agent_role"]
            subtask = result["subtask"]
            response = result["response"]
            success = result.get("success", False)
            color = result.get("agent_color", "#6B7280")

            status_icon = "✅" if success else "⚠️"
            sections.append(f"\n---\n\n### {status_icon} {agent_name} — {agent_role}")
            sections.append(f"**Task:** {subtask}\n")
            sections.append(response)

        sections.append(
            "\n---\n\n*Coordinated by HILMAN (Project Manager). "
            "Each agent focused on their area of expertise.*"
        )

        return "\n".join(sections)

    async def collaborate_stream(
        self,
        prompt: str,
        agent_ids: Optional[List[str]] = None,
        history: Optional[List[Dict[str, str]]] = None,
    ):
        """
        Streaming version of collaborate.
        Yields SSE-compatible chunks as each agent completes.

        Yields:
            Dict with 'event' type and data payload
        """
        if agent_ids:
            agents = agent_ids
        else:
            agents = self.get_collaborating_agents(prompt)

        logger.info("Starting streaming collaboration with agents: %s", agents)

        # Yield collaboration start event
        yield {
            "event": "collaboration_start",
            "agents": [
                {"id": aid, "name": get_agent_info(aid)["name"]}
                for aid in agents
            ],
            "prompt": prompt[:200],
        }

        # Generate sub-tasks
        subtasks = {}
        for agent_id in agents:
            subtasks[agent_id] = self._generate_subtask(agent_id, prompt)
            yield {
                "event": "subtask_assigned",
                "agent_id": agent_id,
                "subtask": subtasks[agent_id],
            }

        # Dispatch all agents in parallel
        tasks = [
            self._dispatch_to_agent(agent_id, subtask, prompt, history)
            for agent_id, subtask in subtasks.items()
        ]

        # Process results as they complete
        results = []
        for coro in asyncio.as_completed(tasks):
            result = await coro
            results.append(result)
            yield {
                "event": "agent_completed",
                "agent_id": result["agent_id"],
                "agent_name": result["agent_name"],
                "agent_color": result.get("agent_color", "#6B7280"),
                "subtask": result["subtask"],
                "response": result["response"],
                "success": result.get("success", False),
            }

        # Combine and yield final result
        combined = self._combine_responses(results, prompt)
        yield {
            "event": "collaboration_complete",
            "response": combined,
            "agents": [
                {
                    "id": r["agent_id"],
                    "name": r["agent_name"],
                    "subtask": r["subtask"],
                    "response": r["response"],
                    "success": r.get("success", False),
                }
                for r in results
            ],
            "primary_agent": "hilman",
        }
