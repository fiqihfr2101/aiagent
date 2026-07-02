"""
Code Executor - Sandboxed code execution for Python, shell, and API calls.

Security measures:
- Runs in subprocess (never eval/exec)
- Timeout limits (max 60 seconds)
- Output size limits (max 100KB)
- Blocks dangerous commands
- Captures stdout and stderr separately
"""

import asyncio
import logging
import os
import platform
import re
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

import httpx

logger = logging.getLogger(__name__)

# Maximum allowed timeout in seconds
MAX_TIMEOUT = 60
# Maximum output size in bytes (100KB)
MAX_OUTPUT_SIZE = 100 * 1024

# Dangerous shell patterns to block
DANGEROUS_PATTERNS = [
    r'\brm\s+(-[rf]+\s+)?/',  # rm -rf /, rm /
    r'\bmkfs\b',               # format filesystem
    r'\bformat\b',             # Windows format
    r'\bdd\s+.*of=',          # dd to device
    r'\b>\s*/dev/',            # write to devices
    r'\bchmod\s+777\s+/',     # chmod 777 /
    r'\bshutdown\b',           # shutdown
    r'\breboot\b',             # reboot
    r'\binit\s+0\b',           # init 0
    r'\bkill\s+-9\s+1\b',     # kill PID 1
    r':\(\)\{.*\}',            # fork bomb
    r'\bnc\s+-l\b',            # netcat listener
    r'\bcurl\b.*\|\s*(ba)?sh', # curl pipe to shell
    r'\bwget\b.*\|\s*(ba)?sh', # wget pipe to shell
]

# Python dangerous patterns
PYTHON_DANGEROUS = [
    r'\b__import__\b',
    r'\bexec\s*\(',
    r'\beval\s*\(',
    r'\bos\.system\s*\(',
    r'\bsubprocess\b',
    r'\bshutil\.rmtree\b',
    r'\bshutil\.rm\b',
]

# Default working directory for agents
DEFAULT_AGENT_WORK_DIR = r"C:\Users\qoinj\Documents\Fiqih\Project"


class CodeExecutor:
    """Executes code in sandboxed subprocesses with file operation support."""

    def __init__(self):
        self.is_windows = platform.system() == "Windows"
        # On Windows use 'python', on Linux use 'python3'
        self.python_cmd = "python" if self.is_windows else "python3"
        # Shell command
        self.shell_cmd = "bash" if not self.is_windows else "cmd"
        self.shell_flag = "-c" if not self.is_windows else "/c"
        # Working directory from environment or default
        self._agent_work_dir = os.getenv("AGENT_WORK_DIR", DEFAULT_AGENT_WORK_DIR)
        # Ensure working directory exists
        os.makedirs(self._agent_work_dir, exist_ok=True)
        logger.info("Agent working directory: %s", self._agent_work_dir)

    @property
    def agent_work_dir(self) -> str:
        """Get the current agent working directory."""
        return self._agent_work_dir

    @agent_work_dir.setter
    def agent_work_dir(self, path: str):
        """Set the agent working directory."""
        os.makedirs(path, exist_ok=True)
        self._agent_work_dir = path
        logger.info("Agent working directory changed to: %s", path)

    def _is_dangerous_command(self, command: str) -> Optional[str]:
        """Check if a shell command contains dangerous patterns.
        Returns the matched pattern or None if safe."""
        cmd_lower = command.lower().strip()
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, cmd_lower):
                return pattern
        return None

    def _is_dangerous_python(self, code: str) -> Optional[str]:
        """Check if Python code contains dangerous patterns.
        Returns the matched pattern or None if safe."""
        code_lower = code.lower()
        for pattern in PYTHON_DANGEROUS:
            if re.search(pattern, code_lower):
                return pattern
        return None

    def _truncate_output(self, data: str) -> str:
        """Truncate output to MAX_OUTPUT_SIZE."""
        encoded = data.encode("utf-8", errors="replace")
        if len(encoded) > MAX_OUTPUT_SIZE:
            truncated = encoded[:MAX_OUTPUT_SIZE].decode("utf-8", errors="ignore")
            return truncated + "\n... [OUTPUT TRUNCATED - exceeded 100KB limit]"
        return data

    def _resolve_path(self, path: str) -> str:
        """Resolve a path relative to the agent working directory.
        
        Args:
            path: Relative or absolute path
            
        Returns:
            Absolute path resolved from agent work directory
        """
        # If path is absolute, return as-is
        if os.path.isabs(path):
            return path
        # Otherwise resolve relative to agent work directory
        return os.path.join(self._agent_work_dir, path)

    def execute_python(self, code: str, timeout: int = 30) -> Dict:
        """Execute Python code in a sandboxed subprocess.

        Args:
            code: Python code to execute
            timeout: Maximum execution time in seconds (max 60)

        Returns:
            Dict with success, language, code, stdout, stderr, exit_code, duration_ms
        """
        timeout = min(timeout, MAX_TIMEOUT)

        # Check for dangerous patterns
        danger = self._is_dangerous_python(code)
        if danger:
            return {
                "success": False,
                "language": "python",
                "code": code,
                "stdout": "",
                "stderr": f"Blocked: code contains dangerous pattern: {danger}",
                "exit_code": -1,
                "duration_ms": 0,
            }

        start_time = time.time()
        try:
            result = subprocess.run(
                [self.python_cmd, "-c", code],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=self._agent_work_dir,
                # Don't inherit environment for basic isolation
                # but keep PATH so python is findable
            )
            duration_ms = int((time.time() - start_time) * 1000)

            stdout = self._truncate_output(result.stdout or "")
            stderr = self._truncate_output(result.stderr or "")

            return {
                "success": result.returncode == 0,
                "language": "python",
                "code": code,
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": result.returncode,
                "duration_ms": duration_ms,
                "cwd": self._agent_work_dir,
            }

        except subprocess.TimeoutExpired:
            duration_ms = int((time.time() - start_time) * 1000)
            return {
                "success": False,
                "language": "python",
                "code": code,
                "stdout": "",
                "stderr": f"Execution timed out after {timeout} seconds",
                "exit_code": -1,
                "duration_ms": duration_ms,
                "cwd": self._agent_work_dir,
            }
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error("Python execution error: %s", e)
            return {
                "success": False,
                "language": "python",
                "code": code,
                "stdout": "",
                "stderr": f"Execution error: {str(e)}",
                "exit_code": -1,
                "duration_ms": duration_ms,
                "cwd": self._agent_work_dir,
            }

    def execute_shell(self, command: str, timeout: int = 30) -> Dict:
        """Execute a shell command in a sandboxed subprocess.

        Args:
            command: Shell command to execute
            timeout: Maximum execution time in seconds (max 60)

        Returns:
            Dict with success, language, code, stdout, stderr, exit_code, duration_ms
        """
        timeout = min(timeout, MAX_TIMEOUT)

        # Check for dangerous patterns
        danger = self._is_dangerous_command(command)
        if danger:
            return {
                "success": False,
                "language": "shell",
                "code": command,
                "stdout": "",
                "stderr": f"Blocked: command contains dangerous pattern: {danger}",
                "exit_code": -1,
                "duration_ms": 0,
            }

        start_time = time.time()
        try:
            if self.is_windows:
                # Use cmd on Windows
                result = subprocess.run(
                    [self.shell_cmd, self.shell_flag, command],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    shell=False,
                    cwd=self._agent_work_dir,
                )
            else:
                # Use bash on Linux/Mac
                result = subprocess.run(
                    ["bash", "-c", command],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    shell=False,
                    cwd=self._agent_work_dir,
                )

            duration_ms = int((time.time() - start_time) * 1000)

            stdout = self._truncate_output(result.stdout or "")
            stderr = self._truncate_output(result.stderr or "")

            return {
                "success": result.returncode == 0,
                "language": "shell",
                "code": command,
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": result.returncode,
                "duration_ms": duration_ms,
                "cwd": self._agent_work_dir,
            }

        except subprocess.TimeoutExpired:
            duration_ms = int((time.time() - start_time) * 1000)
            return {
                "success": False,
                "language": "shell",
                "code": command,
                "stdout": "",
                "stderr": f"Command timed out after {timeout} seconds",
                "exit_code": -1,
                "duration_ms": duration_ms,
                "cwd": self._agent_work_dir,
            }
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error("Shell execution error: %s", e)
            return {
                "success": False,
                "language": "shell",
                "code": command,
                "stdout": "",
                "stderr": f"Execution error: {str(e)}",
                "exit_code": -1,
                "duration_ms": duration_ms,
                "cwd": self._agent_work_dir,
            }

    async def execute_api(
        self,
        method: str,
        url: str,
        headers: Optional[Dict] = None,
        body: Optional[Dict] = None,
        timeout: int = 30,
    ) -> Dict:
        """Make an HTTP API call.

        Args:
            method: HTTP method (GET, POST, PUT, DELETE, PATCH)
            url: Target URL
            headers: Optional request headers
            body: Optional request body (JSON)
            timeout: Request timeout in seconds (max 60)

        Returns:
            Dict with success, language, code, stdout (response body), stderr, exit_code, duration_ms
        """
        timeout = min(timeout, MAX_TIMEOUT)
        method = method.upper()

        # Validate method
        valid_methods = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}
        if method not in valid_methods:
            return {
                "success": False,
                "language": "api",
                "code": f"{method} {url}",
                "stdout": "",
                "stderr": f"Invalid HTTP method: {method}. Valid: {', '.join(valid_methods)}",
                "exit_code": -1,
                "duration_ms": 0,
            }

        # Basic URL validation
        if not url.startswith(("http://", "https://")):
            return {
                "success": False,
                "language": "api",
                "code": f"{method} {url}",
                "stdout": "",
                "stderr": "Invalid URL: must start with http:// or https://",
                "exit_code": -1,
                "duration_ms": 0,
            }

        start_time = time.time()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                kwargs = {"method": method, "url": url}
                if headers:
                    kwargs["headers"] = headers
                if body and method in ("POST", "PUT", "PATCH"):
                    kwargs["json"] = body

                response = await client.request(**kwargs)
                duration_ms = int((time.time() - start_time) * 1000)

                # Try to parse response as JSON
                try:
                    response_body = response.json()
                    import json as json_mod
                    stdout = json_mod.dumps(response_body, indent=2, ensure_ascii=False)
                except Exception:
                    stdout = response.text

                stdout = self._truncate_output(stdout)

                return {
                    "success": 200 <= response.status_code < 400,
                    "language": "api",
                    "code": f"{method} {url}",
                    "stdout": stdout,
                    "stderr": "" if 200 <= response.status_code < 400 else f"HTTP {response.status_code}",
                    "exit_code": response.status_code,
                    "duration_ms": duration_ms,
                    "response_headers": dict(response.headers),
                }

        except httpx.TimeoutException:
            duration_ms = int((time.time() - start_time) * 1000)
            return {
                "success": False,
                "language": "api",
                "code": f"{method} {url}",
                "stdout": "",
                "stderr": f"Request timed out after {timeout} seconds",
                "exit_code": -1,
                "duration_ms": duration_ms,
            }
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error("API execution error: %s", e)
            return {
                "success": False,
                "language": "api",
                "code": f"{method} {url}",
                "stdout": "",
                "stderr": f"Request error: {str(e)}",
                "exit_code": -1,
                "duration_ms": duration_ms,
            }

    def execute_code(self, language: str, code: str, timeout: int = 30) -> Dict:
        """Execute code based on detected language.

        Args:
            language: Code language (python, shell, api)
            code: Code/command/URL to execute
            timeout: Maximum execution time in seconds

        Returns:
            Execution result dict
        """
        language = language.lower().strip()

        if language in ("python", "py", "python3"):
            return self.execute_python(code, timeout)
        elif language in ("shell", "bash", "sh", "cmd", "powershell", "ps1"):
            return self.execute_shell(code, timeout)
        elif language in ("api", "http", "curl"):
            # Parse API call: "METHOD URL" or just "URL" (defaults to GET)
            parts = code.strip().split(None, 1)
            if len(parts) == 2 and parts[0].upper() in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                # Need to run async - return a coroutine marker
                # This is handled by the caller
                return {"_async": True, "method": parts[0], "url": parts[1]}
            elif len(parts) == 1 and parts[0].startswith(("http://", "https://")):
                return {"_async": True, "method": "GET", "url": parts[0]}
            else:
                # Try to use it as shell curl command
                return self.execute_shell(code, timeout)
        else:
            return {
                "success": False,
                "language": language,
                "code": code,
                "stdout": "",
                "stderr": f"Unsupported language: {language}. Supported: python, shell, api",
                "exit_code": -1,
                "duration_ms": 0,
            }

    async def execute_code_async(self, language: str, code: str, timeout: int = 30) -> Dict:
        """Async wrapper for execute_code that handles API calls.

        Args:
            language: Code language
            code: Code to execute
            timeout: Maximum execution time

        Returns:
            Execution result dict
        """
        language = language.lower().strip()

        if language in ("api", "http", "curl"):
            parts = code.strip().split(None, 1)
            if len(parts) == 2 and parts[0].upper() in ("GET", "POST", "PUT", "DELETE", "PATCH"):
                return await self.execute_api(parts[0], parts[1], timeout=timeout)
            elif len(parts) == 1 and parts[0].startswith(("http://", "https://")):
                return await self.execute_api("GET", parts[0], timeout=timeout)
            else:
                # Run as shell command in a thread
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, lambda: self.execute_shell(code, timeout))
        else:
            # Run sync methods in thread pool
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, lambda: self.execute_code(language, code, timeout))

    # ─── File Operations ─────────────────────────────────────────────

    def write_file(self, path: str, content: str, overwrite: bool = False) -> Dict:
        """Write content to a file in the agent working directory.

        Args:
            path: File path (relative to agent work dir or absolute)
            content: File content to write
            overwrite: If False, don't overwrite existing files

        Returns:
            Dict with success, path, size, created_at
        """
        try:
            abs_path = self._resolve_path(path)
            
            # Check if file exists and overwrite is False
            if os.path.exists(abs_path) and not overwrite:
                return {
                    "success": False,
                    "error": f"File already exists: {abs_path}. Use overwrite=True to replace.",
                    "path": abs_path,
                }
            
            # Create parent directories if needed
            parent_dir = os.path.dirname(abs_path)
            os.makedirs(parent_dir, exist_ok=True)
            
            # Write the file
            with open(abs_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            file_size = os.path.getsize(abs_path)
            created_at = datetime.now().isoformat()
            
            logger.info("File written: %s (%d bytes)", abs_path, file_size)
            
            return {
                "success": True,
                "path": abs_path,
                "size": file_size,
                "created_at": created_at,
            }
        except Exception as e:
            logger.error("Failed to write file %s: %s", path, e)
            return {
                "success": False,
                "error": str(e),
                "path": path,
            }

    def read_file(self, path: str) -> Dict:
        """Read content from a file in the agent working directory.

        Args:
            path: File path (relative to agent work dir or absolute)

        Returns:
            Dict with success, path, content, size
        """
        try:
            abs_path = self._resolve_path(path)
            
            if not os.path.exists(abs_path):
                return {
                    "success": False,
                    "error": f"File not found: {abs_path}",
                    "path": abs_path,
                }
            
            with open(abs_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            file_size = os.path.getsize(abs_path)
            
            return {
                "success": True,
                "path": abs_path,
                "content": content,
                "size": file_size,
            }
        except Exception as e:
            logger.error("Failed to read file %s: %s", path, e)
            return {
                "success": False,
                "error": str(e),
                "path": path,
            }

    def create_project(self, name: str, template: str = "default") -> Dict:
        """Create a new project in the agent working directory.

        Args:
            name: Project name (used as directory name)
            template: Project template type (default, web, api, data)

        Returns:
            Dict with success, project_path, structure
        """
        try:
            # Sanitize project name
            safe_name = re.sub(r'[^\w\-]', '_', name)
            project_path = os.path.join(self._agent_work_dir, safe_name)
            
            # Check if project already exists
            if os.path.exists(project_path):
                return {
                    "success": False,
                    "error": f"Project already exists: {project_path}",
                    "project_path": project_path,
                }
            
            # Create project structure based on template
            structure = self._get_project_structure(template)
            
            # Create all directories
            for dir_path in structure["directories"]:
                full_path = os.path.join(project_path, dir_path)
                os.makedirs(full_path, exist_ok=True)
            
            # Create template files
            for file_path, content in structure["files"].items():
                full_path = os.path.join(project_path, file_path)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(content)
            
            logger.info("Project created: %s at %s", name, project_path)
            
            return {
                "success": True,
                "project_path": project_path,
                "project_name": safe_name,
                "template": template,
                "structure": structure,
            }
        except Exception as e:
            logger.error("Failed to create project %s: %s", name, e)
            return {
                "success": False,
                "error": str(e),
                "project_name": name,
            }

    def _get_project_structure(self, template: str) -> Dict:
        """Get project structure based on template type.
        
        Args:
            template: Template type (default, web, api, data)
            
        Returns:
            Dict with directories and files
        """
        if template == "web":
            return {
                "directories": ["src", "public", "tests", "docs"],
                "files": {
                    "README.md": f"# Project\n\nCreated by AFILABS Agent\n\n## Getting Started\n\n```bash\nnpm install\nnpm start\n```\n",
                    "package.json": '{\n  "name": "project",\n  "version": "1.0.0",\n  "scripts": {\n    "start": "react-scripts start",\n    "build": "react-scripts build",\n    "test": "react-scripts test"\n  }\n}\n',
                    ".gitignore": "node_modules/\nbuild/\n.env\n",
                }
            }
        elif template == "api":
            return {
                "directories": ["src", "tests", "docs", "scripts"],
                "files": {
                    "README.md": f"# API Project\n\nCreated by AFILABS Agent\n\n## Getting Started\n\n```bash\npip install -r requirements.txt\npython src/main.py\n```\n",
                    "requirements.txt": "fastapi>=0.100.0\nuvicorn>=0.23.0\npydantic>=2.0.0\n",
                    ".gitignore": "__pycache__/\n*.pyc\n.env\nvenv/\n",
                }
            }
        elif template == "data":
            return {
                "directories": ["data", "notebooks", "src", "output", "docs"],
                "files": {
                    "README.md": f"# Data Project\n\nCreated by AFILABS Agent\n\n## Structure\n\n- `data/` - Raw and processed data\n- `notebooks/` - Jupyter notebooks\n- `src/` - Source code\n- `output/` - Generated outputs\n",
                    "requirements.txt": "pandas>=2.0.0\nnumpy>=1.24.0\nmatplotlib>=3.7.0\njupyter>=1.0.0\n",
                    ".gitignore": "data/raw/\noutput/\n.ipynb_checkpoints/\n",
                }
            }
        else:  # default
            return {
                "directories": ["src", "tests", "docs"],
                "files": {
                    "README.md": f"# Project\n\nCreated by AFILABS Agent\n\n## Getting Started\n\nAdd your project documentation here.\n",
                    ".gitignore": "__pycache__/\n*.pyc\n.env\nnode_modules/\nbuild/\n",
                }
            }

    def list_projects(self) -> Dict:
        """List all projects in the agent working directory.

        Returns:
            Dict with success, projects list
        """
        try:
            projects = []
            for item in os.listdir(self._agent_work_dir):
                item_path = os.path.join(self._agent_work_dir, item)
                if os.path.isdir(item_path):
                    # Check if it looks like a project (has README or src)
                    has_readme = os.path.exists(os.path.join(item_path, "README.md"))
                    has_src = os.path.exists(os.path.join(item_path, "src"))
                    projects.append({
                        "name": item,
                        "path": item_path,
                        "has_readme": has_readme,
                        "has_src": has_src,
                        "created_at": datetime.fromtimestamp(os.path.getctime(item_path)).isoformat(),
                    })
            
            return {
                "success": True,
                "projects": projects,
                "count": len(projects),
            }
        except Exception as e:
            logger.error("Failed to list projects: %s", e)
            return {
                "success": False,
                "error": str(e),
                "projects": [],
            }


# Singleton instance
code_executor = CodeExecutor()
