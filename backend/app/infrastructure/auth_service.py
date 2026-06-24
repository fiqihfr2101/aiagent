"""
JWT Authentication Service for H.E.R.M.E.S. AI Agent Orchestrator.

Handles access/refresh token generation, validation, and auth endpoints.
"""

import os
import time
import secrets
import hashlib
import logging
from typing import Optional
from datetime import datetime, timedelta

import jwt
from pydantic import BaseModel, Field

logger = logging.getLogger("hermes.auth")

# ─── Configuration ───────────────────────────────────────────────
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

# In-memory user store (replace with DB in production)
_users_db: dict[str, dict] = {}

# In-memory revoked tokens (use Redis in production)
_revoked_tokens: set[str] = set()

# In-memory refresh token store
_refresh_tokens: dict[str, dict] = {}


# ─── Pydantic Models ─────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class RefreshRequest(BaseModel):
    refresh_token: str

class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None

class UserResponse(BaseModel):
    username: str
    role: str


# ─── Password Hashing ────────────────────────────────────────────

def _hash_password(password: str) -> str:
    """Hash password using SHA-256 with a salt."""
    salt = os.getenv("PASSWORD_SALT", "hermes-default-salt")
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def _verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return _hash_password(password) == hashed


# ─── User Management ─────────────────────────────────────────────

def init_default_user():
    """Create default admin user if no users exist."""
    if not _users_db:
        admin_password = os.getenv("ADMIN_PASSWORD", "hermes-admin-2024")
        _users_db["admin"] = {
            "username": "admin",
            "password_hash": _hash_password(admin_password),
            "role": "admin",
        }
        logger.info("Default admin user created (username: admin)")


def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Authenticate a user and return user data if valid."""
    user = _users_db.get(username)
    if not user:
        return None
    if not _verify_password(password, user["password_hash"]):
        return None
    return {"username": user["username"], "role": user["role"]}


def register_user(username: str, password: str, role: str = "user") -> Optional[dict]:
    """Register a new user."""
    if username in _users_db:
        return None
    _users_db[username] = {
        "username": username,
        "password_hash": _hash_password(password),
        "role": role,
    }
    logger.info("User registered: %s (role: %s)", username, role)
    return {"username": username, "role": role}


# ─── JWT Token Operations ────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "access",
        "jti": secrets.token_hex(16),
    })
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT refresh token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    jti = secrets.token_hex(16)
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),
        "type": "refresh",
        "jti": jti,
    })
    token = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    _refresh_tokens[jti] = {
        "username": data.get("sub"),
        "expires": expire,
        "revoked": False,
    }
    return token


def create_token_pair(user_data: dict) -> TokenResponse:
    """Create both access and refresh tokens for a user."""
    token_data = {"sub": user_data["username"], "role": user_data["role"]}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def validate_token(token: str, token_type: str = "access") -> Optional[dict]:
    """Validate a JWT token and return the payload if valid."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])

        if payload.get("type") != token_type:
            return None

        jti = payload.get("jti")
        if jti and jti in _revoked_tokens:
            return None

        if token_type == "refresh" and jti:
            rt_data = _refresh_tokens.get(jti)
            if not rt_data or rt_data.get("revoked"):
                return None

        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token: %s", e)
        return None


def revoke_token(token: str) -> bool:
    """Revoke a token by adding its JTI to the revoked set."""
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
        jti = payload.get("jti")
        if jti:
            _revoked_tokens.add(jti)
            if jti in _refresh_tokens:
                _refresh_tokens[jti]["revoked"] = True
            return True
    except Exception:
        pass
    return False


def revoke_all_user_tokens(username: str) -> int:
    """Revoke all refresh tokens for a user."""
    count = 0
    for jti, data in _refresh_tokens.items():
        if data.get("username") == username and not data.get("revoked"):
            data["revoked"] = True
            _revoked_tokens.add(jti)
            count += 1
    return count


# Initialize default user on module load
init_default_user()
