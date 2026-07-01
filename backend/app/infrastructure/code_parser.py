"""
Code Parser - Parse LLM responses to detect and extract code blocks.

Extracts code from markdown fences (```python ... ```), detects language,
and determines whether code should be auto-executed.
"""

import re
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

# Language aliases
LANGUAGE_ALIASES = {
    "py": "python",
    "python3": "python",
    "python2": "python",
    "bash": "shell",
    "sh": "shell",
    "zsh": "shell",
    "cmd": "shell",
    "powershell": "shell",
    "ps1": "shell",
    "shell": "shell",
    "http": "api",
    "curl": "api",
    "js": "javascript",
    "ts": "typescript",
    "rb": "ruby",
    "yml": "yaml",
}

# Languages we can execute
EXECUTABLE_LANGUAGES = {"python", "shell", "api"}

# Python patterns that suggest auto-execute is safe
PYTHON_SAFE_PATTERNS = [
    r'\bprint\s*\(',
    r'\bimport\s+',
    r'\bfrom\s+\w+\s+import\b',
    r'\bdef\s+\w+',
    r'\bclass\s+\w+',
    r'\bfor\s+\w+\s+in\b',
    r'\bwhile\s+',
    r'\bif\s+',
    r'\belif\s+',
    r'\belse\s*:',
    r'\breturn\b',
    r'\btry\s*:',
    r'\bexcept\b',
    r'\bwith\s+',
    r'\bassert\b',
    r'\bpass\b',
    r'\bbreak\b',
    r'\bcontinue\b',
    r'\byield\b',
    r'\braise\b',
    r'\b\d+\s*[\+\-\*/]',  # arithmetic
    r'\blist\s*\(',
    r'\bdict\s*\(',
    r'\bset\s*\(',
    r'\btuple\s*\(',
    r'\bstr\s*\(',
    r'\bint\s*\(',
    r'\bfloat\s*\(',
    r'\blen\s*\(',
    r'\brange\s*\(',
    r'\benumerate\s*\(',
    r'\bzip\s*\(',
    r'\bmap\s*\(',
    r'\bfilter\s*\(',
    r'\bsorted\s*\(',
]

# Shell patterns that suggest auto-execute is safe (read-only)
SHELL_SAFE_PATTERNS = [
    r'\bls\b',
    r'\bcat\b',
    r'\bgrep\b',
    r'\bfind\b',
    r'\bwc\b',
    r'\bhead\b',
    r'\btail\b',
    r'\bawk\b',
    r'\bsed\b',
    r'\bsort\b',
    r'\buniq\b',
    r'\bcurl\s+.*https?://',  # curl GET
    r'\bwget\b',
    r'\bgit\s+(status|log|diff|show|branch|remote)\b',
    r'\bdocker\s+(ps|images|logs|inspect|stats)\b',
    r'\bwhich\b',
    r'\bwhoami\b',
    r'\bdate\b',
    r'\benv\b',
    r'\becho\b',
    r'\buname\b',
    r'\bhostname\b',
    r'\bdf\b',
    r'\bdu\b',
    r'\bfree\b',
    r'\btop\b',
    r'\bps\b',
]

# Python dangerous patterns (should NOT auto-execute)
PYTHON_DANGEROUS_PATTERNS = [
    r'\bopen\s*\(.*["\']w',      # file writes
    r'\bos\.remove\b',
    r'\bos\.unlink\b',
    r'\bshutil\.rmtree\b',
    r'\bos\.system\b',
    r'\bsubprocess\b',
    r'\b__import__\b',
    r'\bexec\s*\(',
    r'\beval\s*\(',
    r'\brequests\.(post|put|delete|patch)\b',  # network writes
    r'\burllib\b',
    r'\bsocket\b',
    r'\bhttp\.client\b',
]

# Shell dangerous patterns (should NOT auto-execute)
SHELL_DANGEROUS_PATTERNS = [
    r'\brm\b',
    r'\bmv\b.*\s/',             # move to root paths
    r'\bcp\b.*\s/',
    r'\bchmod\b',
    r'\bchown\b',
    r'\bkill\b',
    r'\bpkill\b',
    r'\bsudo\b',
    r'\bsu\b',
    r'\bshutdown\b',
    r'\breboot\b',
    r'\bsystemctl\b',
    r'\bservice\b',
    r'\bapt\b',
    r'\byum\b',
    r'\bpip\s+install\b',
    r'\bnpm\s+install\b',
    r'\bdocker\s+(run|rm|stop|kill|exec)\b',
    r'\bgit\s+(push|pull|commit|merge|checkout|reset)\b',
    r'\bcurl\b.*-X\s*(POST|PUT|DELETE)',
    r'\bcurl\b.*-d\b',          # curl with data (POST)
]


def normalize_language(lang: Optional[str]) -> str:
    """Normalize a language string to a canonical form."""
    if not lang:
        return "unknown"
    lang = lang.lower().strip()
    return LANGUAGE_ALIASES.get(lang, lang)


def parse_code_blocks(text: str) -> List[Dict]:
    """Extract all code blocks from markdown text.

    Matches fenced code blocks: ```language ... ```

    Args:
        text: Markdown text potentially containing code blocks

    Returns:
        List of dicts with keys: language, code, fence_language, start, end
    """
    if not text:
        return []

    blocks = []
    # Match ``` optionally followed by language identifier
    pattern = r'```(\w*)\n(.*?)```'
    
    for match in re.finditer(pattern, text, re.DOTALL):
        fence_lang = match.group(1).strip()
        code = match.group(2).strip()
        
        if not code:
            continue

        # Detect language from fence annotation or content
        if fence_lang:
            language = normalize_language(fence_lang)
        else:
            language = detect_language(code)

        blocks.append({
            "language": language,
            "fence_language": fence_lang or language,
            "code": code,
            "start": match.start(),
            "end": match.end(),
        })

    return blocks


def detect_language(code: str) -> str:
    """Detect programming language from code content.

    Uses heuristics to identify Python, shell, or API calls.

    Args:
        code: Code string to analyze

    Returns:
        Detected language string: 'python', 'shell', 'api', or 'unknown'
    """
    if not code:
        return "unknown"

    code_stripped = code.strip()

    # Check for API/HTTP patterns
    if re.search(r'https?://\S+', code_stripped):
        # Looks like a URL or curl command
        if code_stripped.startswith(('http://', 'https://', 'curl ')):
            return "api"
        # Check if it's a method + URL pattern
        if re.match(r'^(GET|POST|PUT|DELETE|PATCH)\s+https?://', code_stripped, re.IGNORECASE):
            return "api"

    # Python indicators
    python_score = 0
    for pattern in PYTHON_SAFE_PATTERNS:
        if re.search(pattern, code_stripped):
            python_score += 1

    # Strong Python indicators
    if re.search(r'^(import |from |def |class |print\()', code_stripped, re.MULTILINE):
        python_score += 3
    if re.search(r':\s*$', code_stripped, re.MULTILINE):  # colon at end of line
        python_score += 1
    if re.search(r'^\s+(if |for |while |def |class |return |import )', code_stripped, re.MULTILINE):
        python_score += 1

    # Shell indicators
    shell_score = 0
    for pattern in SHELL_SAFE_PATTERNS:
        if re.search(pattern, code_stripped):
            shell_score += 1

    # Shell-specific syntax
    if code_stripped.startswith(('$', '#', '>')):
        shell_score += 2
    if '|' in code_stripped and not '||' in code_stripped:
        shell_score += 1
    if re.search(r'\$\w+', code_stripped):  # $VAR
        shell_score += 1
    if re.search(r'^\s*#!\s*/bin/(ba)?sh', code_stripped):
        shell_score += 5

    # Decide based on scores
    if python_score > shell_score and python_score >= 2:
        return "python"
    elif shell_score > python_score and shell_score >= 1:
        return "shell"
    elif python_score >= 1:
        return "python"
    elif shell_score >= 1:
        return "shell"

    # Default heuristic: if it has Python-like syntax
    if re.search(r'(def |import |print\(|\[.*\]|{.*})', code_stripped):
        return "python"

    # If it looks like commands
    if re.search(r'^\w+\s+', code_stripped, re.MULTILINE):
        return "shell"

    return "unknown"


def should_auto_execute(code: str, language: str) -> bool:
    """Determine if code should be auto-executed.

    Uses heuristics to decide whether it's safe to automatically execute
    the code block without user confirmation.

    Args:
        code: Code to evaluate
        language: Detected language

    Returns:
        True if code appears safe to auto-execute
    """
    if not code or not language:
        return False

    language = language.lower()

    # Only auto-execute known languages
    if language not in EXECUTABLE_LANGUAGES:
        return False

    code_lower = code.lower()

    # Check for dangerous patterns based on language
    if language == "python":
        # Don't auto-execute if dangerous patterns found
        for pattern in PYTHON_DANGEROUS_PATTERNS:
            if re.search(pattern, code_lower):
                return False
        # Auto-execute if safe patterns found
        for pattern in PYTHON_SAFE_PATTERNS:
            if re.search(pattern, code):
                return True
        # If very short (<=3 lines), likely safe
        if len(code.strip().split('\n')) <= 3:
            return True
        return False

    elif language == "shell":
        # Don't auto-execute if dangerous patterns found
        for pattern in SHELL_DANGEROUS_PATTERNS:
            if re.search(pattern, code_lower):
                return False
        # Auto-execute if safe patterns found
        for pattern in SHELL_SAFE_PATTERNS:
            if re.search(pattern, code):
                return True
        return False

    elif language == "api":
        # Auto-execute GET requests only
        if code.strip().upper().startswith("GET") or code.strip().startswith(("http://", "https://")):
            return True
        return False

    return False
