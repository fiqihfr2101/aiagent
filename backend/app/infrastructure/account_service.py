"""
Account Management Service for H.E.R.M.E.S. AI Agent Orchestrator.

Handles password changes, 2FA setup (TOTP), verification, and QR code generation.
"""

import io
import base64
import logging
from typing import Optional

import pyotp
import qrcode
from qrcode.image.pil import PilImage

logger = logging.getLogger("hermes.account")

# Issuer name for TOTP
TOTP_ISSUER = "H.E.R.M.E.S."


def generate_totp_secret() -> str:
    """Generate a new TOTP secret."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str) -> str:
    """Generate a TOTP provisioning URI for QR code."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=TOTP_ISSUER)


def generate_qr_code_base64(uri: str) -> str:
    """Generate a QR code as a base64-encoded PNG image."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a TOTP code against a secret."""
    try:
        totp = pyotp.TOTP(secret)
        # Allow 1 time step tolerance (30 seconds before/after)
        return totp.verify(code, valid_window=1)
    except Exception as e:
        logger.warning("TOTP verification error: %s", e)
        return False


def setup_2fa(username: str) -> dict:
    """
    Generate a new 2FA setup for a user.
    Returns the secret (to store later) and QR code image.
    """
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, username)
    qr_base64 = generate_qr_code_base64(uri)

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "uri": uri,
    }


def get_2fa_status(user_data: dict) -> dict:
    """Get 2FA status for a user."""
    return {
        "enabled": user_data.get("2fa_enabled", False),
        "has_secret": bool(user_data.get("2fa_secret")),
    }
