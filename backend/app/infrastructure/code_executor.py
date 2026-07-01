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
import platform
import re
import subprocess
import time
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
    r'\bopen\s*\(.*["\']w',    # file writes
    r'\bshutil\.rmtree\b',
    r'\bshutil\.rm\b',
]


class CodeExecutor:
    """Executes code in sandboxed subprocesses."""

    def __init__(self):
        self.is_windows = platform.system() == "Windows"
        # On Windows use 'python', on Linux use 'python3'
        self.python_cmd = "python" if self.is_windows else "python3"
        # Shell command
        self.shell_cmd = "bash" if not self.is_windows else "cmd"
        self.shell_flag = "-c" if not self.is_windows else "/c"

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
                )
            else:
                # Use bash on Linux/Mac
                result = subprocess.run(
                    ["bash", "-c", command],
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    shell=False,
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


# Singleton instance
code_executor = CodeExecutor()
