"""
Orchestrator: Routes chat prompts to the most appropriate agent.

Analyzes prompt content using keyword matching and semantic hints
to determine which agent (HILMAN, BAHLUL, DEDEN, TEDDY, BUDI)
should handle the request.
"""

import re
from typing import Optional, List, Dict, Any


# ─── Agent Routing Rules ──────────────────────────────────────────

AGENT_ROUTES = {
    "hilman": {
        "name": "HILMAN",
        "role": "Project Manager",
        "color": "#00D4AA",
        "keywords": [
            "project", "plan", "planning", "timeline", "milestone", "roadmap",
            "requirement", "requirements", "prd", "spec", "specification",
            "sprint", "backlog", "epic", "story", "user story",
            "scope", "budget", "stakeholder", "meeting", "agenda",
            "status update", "progress", "deadline", "deliverable",
            "risk", "dependency", "priorit", "kanban", "scrum",
            "document", "documentation", "review", "approve",
            "coordinate", "organiz", "schedule", "assign",
        ],
    },
    "bahlul": {
        "name": "BAHLUL",
        "role": "Backend Developer",
        "color": "#6366F1",
        "keywords": [
            "api", "backend", "database", "db", "sql", "postgres", "mysql",
            "server", "endpoint", "route", "handler", "middleware",
            "python", "fastapi", "flask", "django", "node", "express",
            "model", "schema", "migration", "query", "orm",
            "authentication", "auth", "jwt", "token", "oauth",
            "redis", "cache", "queue", "celery", "worker",
            "microservice", "docker", "deploy", "kubernetes", "k8s",
            "rest", "graphql", "grpc", "websocket", "socket",
            "crud", "repository", "service layer", "architecture",
            "npm", "pip", "package", "dependency", "install",
            "bug", "error", "exception", "traceback", "stack trace",
            "performance", "optimization", "index", "pool",
        ],
    },
    "deden": {
        "name": "DEDEN",
        "role": "Frontend Developer",
        "color": "#F59E0B",
        "keywords": [
            "frontend", "ui", "ux", "user interface", "user experience",
            "react", "nextjs", "next.js", "vue", "angular", "svelte",
            "component", "jsx", "tsx", "html", "css", "scss", "tailwind",
            "design", "layout", "responsive", "mobile", "desktop",
            "page", "route", "navigation", "menu", "sidebar",
            "button", "form", "input", "modal", "dialog", "popup",
            "animation", "transition", "effect", "style", "theme",
            "icon", "image", "svg", "canvas", "graphic",
            "accessibility", "a11y", "aria", "semantic",
            "state management", "redux", "zustand", "context",
            "hook", "usestate", "useeffect", "custom hook",
            "fetch", "axios", "swr", "react-query", "tanstack",
            "typescript", "type", "interface", "props",
            "dashboard", "chart", "graph", "visualization",
            "color", "font", "typography", "spacing", "grid", "flex",
        ],
    },
    "teddy": {
        "name": "TEDDY",
        "role": "Frontend Developer",
        "color": "#EC4899",
        "keywords": [
            "figma", "sketch", "adobe", "wireframe", "mockup", "prototype",
            "design system", "component library", "storybook",
            "pixel", "viewport", "breakpoint", "media query",
            "svg", "icon", "illustration", "logo", "branding",
            "animation", "motion", "framer", "gsap", "lottie",
            "dark mode", "light mode", "theme", "color palette",
            "font", "typeface", "kerning", "leading", "tracking",
            "spacing", "padding", "margin", "alignment",
            "card", "table", "list", "grid", "masonry",
            "tooltip", "popover", "dropdown", "select", "checkbox",
            "toggle", "switch", "slider", "progress", "spinner",
            "skeleton", "loading", "placeholder", "empty state",
        ],
    },
    "budi": {
        "name": "BUDI",
        "role": "QA Engineer",
        "color": "#22C55E",
        "keywords": [
            "test", "testing", "qa", "quality", "quality assurance",
            "unit test", "integration test", "e2e", "end-to-end",
            "cypress", "playwright", "selenium", "jest", "vitest",
            "pytest", "unittest", "mock", "stub", "fixture",
            "assertion", "expect", "should", "assert",
            "coverage", "code coverage", "test coverage",
            "bug", "defect", "issue", "regression",
            "ci", "cd", "pipeline", "github actions", "jenkins",
            "lint", "eslint", "prettier", "formatter",
            "check", "verify", "validate", "validation",
            "automation", "automate", "script", "test script",
            "browser", "headless", "screenshot", "visual regression",
            "load test", "stress test", "performance test", "benchmark",
            "security test", "penetration", "vulnerability", "audit",
            "report", "reporting", "metrics", "dashboard",
            "edge case", "boundary", "happy path", "negative test",
        ],
    },
}


def determine_agent(prompt: str) -> str:
    """
    Analyze the prompt and return the agent ID best suited to handle it.
    
    Uses keyword frequency scoring — the agent whose keywords appear most
    in the prompt wins. Defaults to 'hilman' (Project Manager) on a tie
    or when no keywords match.
    """
    prompt_lower = prompt.lower()
    
    scores: Dict[str, int] = {}
    
    for agent_id, config in AGENT_ROUTES.items():
        score = 0
        for keyword in config["keywords"]:
            # Use word boundary matching for single words,
            # substring matching for multi-word phrases
            if " " in keyword or len(keyword) <= 3:
                if keyword in prompt_lower:
                    score += 2
            else:
                # Match whole words or common suffixes
                pattern = r'\b' + re.escape(keyword)
                matches = re.findall(pattern, prompt_lower)
                score += len(matches) * 2
                
                # Also check for partial matches (e.g., "reactive" matches "react")
                if keyword in prompt_lower:
                    score += 1
        
        scores[agent_id] = score
    
    if not scores or max(scores.values()) == 0:
        return "hilman"
    
    # Return agent with highest score
    return max(scores, key=scores.get)


def get_agent_info(agent_id: str) -> Dict[str, Any]:
    """Get display info for an agent."""
    config = AGENT_ROUTES.get(agent_id, AGENT_ROUTES["hilman"])
    return {
        "id": agent_id,
        "name": config["name"],
        "role": config["role"],
        "color": config["color"],
    }


def get_all_agents() -> List[Dict[str, Any]]:
    """Get info for all routing agents."""
    return [get_agent_info(aid) for aid in AGENT_ROUTES]


# ─── Base System Prompts (enhanced by KnowledgeBridge) ───────────

AGENT_BASE_SYSTEM_PROMPTS: Dict[str, str] = {
    "hilman": (
        "You are HILMAN, a project manager. You coordinate tasks, create plans, "
        "and ensure project success. Your responsibilities include:\n"
        "- Breaking down requirements into actionable tasks\n"
        "- Creating project plans, timelines, and roadmaps\n"
        "- Prioritizing work and coordinating team efforts\n"
        "- Writing PRDs, specifications, and documentation\n"
        "- Risk assessment and mitigation planning\n\n"
        "Always provide structured, actionable responses. Use markdown formatting. "
        "When asked to create plans, include timelines, milestones, and task assignments."
    ),
    "bahlul": (
        "You are BAHLUL, a backend developer. You build APIs, databases, and "
        "server-side logic. Your expertise includes:\n"
        "- Python, FastAPI, Node.js, Express, Django, Flask\n"
        "- PostgreSQL, Redis, MongoDB, SQL optimization\n"
        "- REST API design, GraphQL, WebSocket\n"
        "- Docker, Kubernetes, CI/CD pipelines\n"
        "- Authentication (JWT, OAuth), security best practices\n"
        "- Microservices architecture, system design\n\n"
        "Write clean, production-ready code with proper error handling. "
        "Always include type hints and docstrings in Python code. "
        "Explain your technical decisions briefly."
    ),
    "deden": (
        "You are DEDEN, a frontend developer. You create UI components and "
        "user interfaces. Your expertise includes:\n"
        "- React, Next.js, TypeScript, Tailwind CSS\n"
        "- Component architecture, state management (Redux, Zustand)\n"
        "- Responsive design, accessibility (a11y)\n"
        "- API integration, data fetching (SWR, React Query)\n"
        "- Performance optimization, lazy loading\n\n"
        "Write clean, reusable components with TypeScript. "
        "Follow modern React patterns (hooks, functional components). "
        "Use Tailwind CSS for styling unless told otherwise."
    ),
    "teddy": (
        "You are TEDDY, a frontend developer specializing in design systems "
        "and visual polish. Your expertise includes:\n"
        "- UI/UX design, design systems, component libraries\n"
        "- CSS animations, transitions, micro-interactions\n"
        "- Figma-to-code conversion, pixel-perfect implementation\n"
        "- Visual hierarchy, typography, color theory\n"
        "- Dark mode, theming, responsive layouts\n\n"
        "Focus on visual quality and user experience. "
        "Pay attention to spacing, alignment, and consistency. "
        "Create smooth, purposeful animations."
    ),
    "budi": (
        "You are BUDI, a QA engineer. You write tests, find bugs, and "
        "ensure quality. Your expertise includes:\n"
        "- Unit testing (pytest, Jest, Vitest)\n"
        "- Integration testing, end-to-end testing (Playwright, Cypress)\n"
        "- Test planning, test case design, boundary analysis\n"
        "- Code coverage analysis, regression testing\n"
        "- CI/CD quality gates, automated testing pipelines\n\n"
        "Write comprehensive tests with clear descriptions. "
        "Cover edge cases and error scenarios. "
        "Follow the AAA pattern (Arrange, Act, Assert)."
    ),
}


def get_base_system_prompt(agent_id: str) -> str:
    """Get the base system prompt for an agent (before knowledge enhancement)."""
    return AGENT_BASE_SYSTEM_PROMPTS.get(
        agent_id,
        f"You are a helpful AI assistant. Provide detailed, accurate responses."
    )


# ─── Multi-Agent Collaboration Detection ──────────────────────────

# Patterns that indicate a need for multi-agent collaboration
COLLABORATION_PATTERNS = {
    "fullstack": [
        "full-stack", "fullstack", "full stack",
        "end-to-end", "e2e",
        "complete feature", "build entire", "build a complete",
        "whole system", "entire system",
        "from scratch",
    ],
    "multi_domain": [
        "both frontend and backend", "frontend and backend",
        "backend and frontend",
        "api and ui", "api and frontend",
        "ui and api", "ui and backend",
        "design and implement", "design and code",
        "plan and build", "plan and implement",
        "design, build, and test",
        "frontend, backend", "backend, frontend",
        "design and develop",
    ],
}

# Which agents should be involved in each collaboration pattern
COLLABORATION_AGENTS = {
    "fullstack": ["hilman", "bahlul", "deden"],
    "fullstack_test": ["hilman", "bahlul", "deden", "budi"],
    "frontend_design": ["deden", "teddy"],
    "backend_qa": ["bahlul", "budi"],
    "full_with_design": ["hilman", "bahlul", "deden", "teddy"],
}


def determine_collaboration(prompt: str) -> List[str]:
    """
    Analyze the prompt and determine if multi-agent collaboration is needed.

    Returns a list of agent IDs to collaborate, or an empty list
    if single-agent routing is sufficient.

    Detection logic:
    1. Check for explicit collaboration trigger keywords
    2. Check if multiple domain keyword categories are hit
    3. Return appropriate agent team
    """
    prompt_lower = prompt.lower()

    # Check explicit collaboration triggers
    for pattern_type, keywords in COLLABORATION_PATTERNS.items():
        for keyword in keywords:
            if keyword in prompt_lower:
                # Determine which agents based on context
                agents = _select_collaboration_team(prompt_lower, pattern_type)
                if agents:
                    return agents

    # Check if multiple agent domains have significant keyword matches
    scores: Dict[str, int] = {}
    for agent_id, config in AGENT_ROUTES.items():
        score = 0
        for kw in config["keywords"]:
            if " " in kw:
                if kw in prompt_lower:
                    score += 2
            else:
                pattern = r'\b' + re.escape(kw)
                matches = re.findall(pattern, prompt_lower)
                score += len(matches) * 2
                if kw in prompt_lower:
                    score += 1
        scores[agent_id] = score

    # Count agents with significant scores (above threshold)
    threshold = 4
    significant_agents = [
        aid for aid, score in scores.items() if score >= threshold
    ]

    if len(significant_agents) >= 3:
        # Strong multi-domain signal
        return _build_team(significant_agents)
    elif len(significant_agents) == 2:
        # Two domains — might benefit from collaboration
        # Only collaborate if both are non-hilman (PM can coordinate)
        non_pm = [a for a in significant_agents if a != "hilman"]
        if len(non_pm) >= 2:
            team = ["hilman"] + non_pm[:3]
            return team

    return []  # No collaboration needed


def _select_collaboration_team(prompt: str, pattern_type: str) -> List[str]:
    """Select the best team composition based on pattern type and context."""
    has_test = any(
        kw in prompt for kw in ["test", "testing", "qa", "quality", "coverage"]
    )
    has_design = any(
        kw in prompt for kw in ["design", "figma", "wireframe", "mockup", "ui/ux"]
    )

    if pattern_type == "fullstack":
        if has_test and has_design:
            return ["hilman", "bahlul", "deden", "teddy", "budi"]
        elif has_test:
            return COLLABORATION_AGENTS["fullstack_test"]
        elif has_design:
            return COLLABORATION_AGENTS["full_with_design"]
        else:
            return COLLABORATION_AGENTS["fullstack"]

    elif pattern_type == "multi_domain":
        if has_test:
            return COLLABORATION_AGENTS["fullstack_test"]
        elif has_design:
            return COLLABORATION_AGENTS["full_with_design"]
        else:
            return COLLABORATION_AGENTS["fullstack"]

    return COLLABORATION_AGENTS["fullstack"]


def _build_team(agent_ids: List[str]) -> List[str]:
    """
    Build a team from a list of agent IDs.
    Ensures hilman is included as coordinator.
    """
    team = []
    seen = set()

    # Add hilman first if not already included
    if "hilman" not in agent_ids:
        team.append("hilman")
        seen.add("hilman")

    for aid in agent_ids:
        if aid not in seen:
            team.append(aid)
            seen.add(aid)

    # Cap at 5 agents
    return team[:5]
