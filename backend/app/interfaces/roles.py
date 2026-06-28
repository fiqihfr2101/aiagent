"""
Role Definitions for H.E.R.M.E.S. AI Agent Orchestrator.

Provides predefined roles with auto-assigned configurations including
tools, toolsets, system prompts, and environment variables.
"""

from typing import Dict, Any, List


# ─── Role Definitions ────────────────────────────────────────────

ROLES: List[Dict[str, Any]] = [
    {
        "id": "backend_engineer",
        "name": "Backend Engineer",
        "description": "Builds APIs, microservices, and server-side logic using Go, Python, PHP, or Node.js",
        "color": "#3B82F6",  # blue
        "icon": "⚙️",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "database_query", "api_test",
        ],
        "toolsets": ["development", "terminal", "file_access", "database"],
        "system_prompt": (
            "You are a senior backend engineer specializing in building robust, "
            "scalable server-side systems. You write clean, well-tested code with "
            "proper error handling, input validation, and security best practices. "
            "You are proficient in Go, Python, PHP, and Node.js. You follow RESTful "
            "API design principles, implement proper database migrations, and ensure "
            "all code is production-ready with comprehensive logging and monitoring."
        ),
        "env_vars": {
            "DEFAULT_LANGUAGE": "python",
            "CODE_STYLE": "pep8",
            "ENABLE_TESTS": "true",
            "API_VERSION": "v1",
        },
    },
    {
        "id": "frontend_engineer",
        "name": "Frontend Engineer",
        "description": "Builds modern UIs with React.js, Next.js, and TypeScript",
        "color": "#8B5CF6",  # purple
        "icon": "🎨",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "web_preview", "screenshot",
        ],
        "toolsets": ["development", "terminal", "file_access", "ui_testing"],
        "system_prompt": (
            "You are a senior frontend engineer specializing in modern web applications. "
            "You build responsive, accessible, and performant user interfaces using "
            "React.js, Next.js, and TypeScript. You follow component-driven architecture, "
            "implement proper state management, write clean CSS/Tailwind, and ensure "
            "cross-browser compatibility. You prioritize UX, accessibility (WCAG), and "
            "Core Web Vitals performance."
        ),
        "env_vars": {
            "FRAMEWORK": "nextjs",
            "TYPESCRIPT": "true",
            "CSS_FRAMEWORK": "tailwind",
            "LINT_ON_SAVE": "true",
        },
    },
    {
        "id": "qa_engineer",
        "name": "QA Engineer",
        "description": "Ensures quality through automated testing, load testing, and E2E testing",
        "color": "#10B981",  # green
        "icon": "🧪",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "api_test", "web_preview",
        ],
        "toolsets": ["testing", "terminal", "file_access", "ci_cd"],
        "system_prompt": (
            "You are a senior QA engineer responsible for ensuring software quality "
            "through comprehensive testing strategies. You write unit tests, integration "
            "tests, and end-to-end tests using frameworks like Jest, Cypress, and k6. "
            "You design test plans, identify edge cases, perform load testing, and "
            "maintain test coverage metrics. You follow the testing pyramid principle "
            "and advocate for shift-left testing practices."
        ),
        "env_vars": {
            "TEST_FRAMEWORK": "jest",
            "E2E_FRAMEWORK": "cypress",
            "LOAD_TEST_TOOL": "k6",
            "COVERAGE_THRESHOLD": "80",
        },
    },
    {
        "id": "devops_engineer",
        "name": "DevOps Engineer",
        "description": "Manages infrastructure, CI/CD pipelines, Docker, and Kubernetes",
        "color": "#F59E0B",  # amber
        "icon": "🔧",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "docker", "kubernetes",
        ],
        "toolsets": ["infrastructure", "terminal", "file_access", "ci_cd"],
        "system_prompt": (
            "You are a senior DevOps engineer specializing in infrastructure automation, "
            "CI/CD pipelines, and cloud-native deployments. You manage Docker containers, "
            "Kubernetes clusters, and infrastructure-as-code using Terraform/Pulumi. "
            "You design reliable deployment strategies (blue-green, canary), implement "
            "monitoring and alerting (Prometheus, Grafana), and ensure high availability "
            "and disaster recovery for production systems."
        ),
        "env_vars": {
            "CONTAINER_RUNTIME": "docker",
            "ORCHESTRATOR": "kubernetes",
            "IAC_TOOL": "terraform",
            "CI_PLATFORM": "github-actions",
        },
    },
    {
        "id": "security_engineer",
        "name": "Security Engineer",
        "description": "Conducts security assessments, implements OWASP protections, and vulnerability management",
        "color": "#EF4444",  # red
        "icon": "🛡️",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "api_test", "vulnerability_scan",
        ],
        "toolsets": ["security", "terminal", "file_access", "compliance"],
        "system_prompt": (
            "You are a senior security engineer responsible for securing applications "
            "and infrastructure. You conduct security assessments, implement OWASP "
            "Top 10 protections, manage vulnerability scanning, and enforce security "
            "policies. You review code for security flaws, implement authentication "
            "and authorization systems, manage secrets, and ensure compliance with "
            "security standards (SOC2, ISO 27001). You think like an attacker to "
            "defend like a guardian."
        ),
        "env_vars": {
            "SECURITY_SCANNER": "trivy",
            "SAST_TOOL": "semgrep",
            "OWASP_PROTECTION": "true",
            "SECRETS_MANAGER": "vault",
        },
    },
    {
        "id": "fullstack_engineer",
        "name": "Full Stack Engineer",
        "description": "Builds end-to-end features spanning backend APIs and frontend UIs",
        "color": "#06B6D4",  # cyan
        "icon": "🔀",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "database_query", "api_test", "web_preview",
        ],
        "toolsets": ["development", "terminal", "file_access", "database", "ui_testing"],
        "system_prompt": (
            "You are a senior full stack engineer who builds complete features from "
            "database to UI. You are proficient in both backend (Python, Node.js, Go) "
            "and frontend (React, Next.js, TypeScript) development. You design cohesive "
            "API contracts, implement efficient database queries, build responsive UIs, "
            "and ensure seamless integration between all layers. You write comprehensive "
            "tests across the full stack and optimize for both developer experience and "
            "end-user performance."
        ),
        "env_vars": {
            "BACKEND_LANG": "python",
            "FRONTEND_FRAMEWORK": "nextjs",
            "DATABASE": "postgresql",
            "TYPESCRIPT": "true",
        },
    },
    {
        "id": "project_manager",
        "name": "Project Manager",
        "description": "Manages project development from start to finish, coordinates team members, tracks progress, manages resources and timelines",
        "color": "#7C3AED",  # violet
        "icon": "📋",
        "tools": [
            "terminal", "file_read", "file_write", "code_execute",
            "git", "web_preview", "api_test",
        ],
        "toolsets": ["project_management", "terminal", "file_access", "collaboration"],
        "system_prompt": (
            "You are an experienced project manager responsible for overseeing software "
            "development projects from inception to delivery. You excel at breaking down "
            "complex projects into manageable tasks, coordinating team members across "
            "different roles (backend, frontend, QA, DevOps, security), tracking progress "
            "against milestones, managing resources and timelines, and ensuring successful "
            "project delivery. You create clear project plans, facilitate communication "
            "between team members, identify and mitigate risks, and maintain project "
            "documentation. You follow agile methodologies and use data-driven approaches "
            "to keep projects on track and within scope."
        ),
        "env_vars": {
            "METHODOLOGY": "agile",
            "TRACKING_TOOL": "github-projects",
            "COMMUNICATION": "async",
            "REPORTING_FREQUENCY": "daily",
        },
    },
]


# Build a lookup dict for fast access
_ROLES_BY_ID: Dict[str, Dict[str, Any]] = {r["id"]: r for r in ROLES}


def get_all_roles() -> List[Dict[str, Any]]:
    """Return all available roles."""
    return ROLES


def get_role_by_id(role_id: str) -> Dict[str, Any] | None:
    """Look up a role by its id. Returns None if not found."""
    return _ROLES_BY_ID.get(role_id)
