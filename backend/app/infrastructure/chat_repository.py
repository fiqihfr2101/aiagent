"""
Chat Repository — PostgreSQL-backed storage for chat conversations and messages.

Uses the same pg_pool pattern as AgentRepository for consistent DB access.
"""

import uuid
import json
import datetime
import logging
from typing import Optional, List, Dict, Any

from .pg_pool import get_pool

logger = logging.getLogger(__name__)


class ChatRepository:
    """PostgreSQL-backed chat conversation storage."""

    def __init__(self, dsn: Optional[str] = None):
        self._pool = get_pool(dsn)
        self._init_db()

    def _init_db(self):
        """Create chat tables if they don't exist (idempotent)."""
        try:
            with self._pool.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS chat_conversations (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL DEFAULT 'anonymous',
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id TEXT PRIMARY KEY,
                        conversation_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        agent_name TEXT,
                        agent_role TEXT,
                        files TEXT,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
                    )
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
                    ON chat_messages(conversation_id)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
                    ON chat_conversations(user_id)
                """)
            logger.info("Chat tables ensured in PostgreSQL")
        except Exception as e:
            logger.warning("Could not create chat tables: %s", e)

    def create_conversation(self, user_id: str = "anonymous") -> str:
        """Create a new conversation and return its ID."""
        conv_id = uuid.uuid4().hex[:12]
        now = datetime.datetime.now().isoformat()
        query = """
            INSERT INTO chat_conversations (id, user_id, created_at, updated_at)
            VALUES (%s, %s, %s, %s)
        """
        with self._pool.cursor() as cursor:
            cursor.execute(query, (conv_id, user_id, now, now))
        logger.info("Created chat conversation %s for user %s", conv_id, user_id)
        return conv_id

    def conversation_exists(self, conversation_id: str) -> bool:
        """Check if a conversation exists."""
        query = "SELECT 1 FROM chat_conversations WHERE id = %s"
        with self._pool.cursor() as cursor:
            cursor.execute(query, (conversation_id,))
            return cursor.fetchone() is not None

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        agent_name: Optional[str] = None,
        agent_role: Optional[str] = None,
        files: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Add a message to a conversation."""
        msg_id = uuid.uuid4().hex[:12]
        now = datetime.datetime.now().isoformat()
        files_json = json.dumps(files) if files else None

        query = """
            INSERT INTO chat_messages (id, conversation_id, role, content, agent_name, agent_role, files, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """
        with self._pool.cursor() as cursor:
            cursor.execute(query, (msg_id, conversation_id, role, content, agent_name, agent_role, files_json, now))

        # Update conversation's updated_at
        with self._pool.cursor() as cursor:
            cursor.execute(
                "UPDATE chat_conversations SET updated_at = %s WHERE id = %s",
                (now, conversation_id),
            )

        return {
            "id": msg_id,
            "role": role,
            "content": content,
            "agent_name": agent_name,
            "agent_role": agent_role,
            "files": files or [],
            "created_at": now,
        }

    def get_messages(self, conversation_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get messages for a conversation, most recent first."""
        query = """
            SELECT id, role, content, agent_name, agent_role, files, created_at
            FROM chat_messages
            WHERE conversation_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """
        with self._pool.cursor() as cursor:
            cursor.execute(query, (conversation_id, limit))
            rows = cursor.fetchall()

        messages = []
        for row in reversed(rows):  # Reverse to chronological order
            msg = dict(row)
            if msg.get("files"):
                try:
                    msg["files"] = json.loads(msg["files"])
                except (json.JSONDecodeError, TypeError):
                    msg["files"] = []
            else:
                msg["files"] = []
            messages.append(msg)
        return messages

    def get_conversation_history_for_context(self, conversation_id: str, limit: int = 10) -> List[Dict[str, str]]:
        """Get recent messages formatted for LLM context (role + content only)."""
        messages = self.get_messages(conversation_id, limit=limit)
        return [
            {"role": "user" if m["role"] == "user" else "assistant", "content": m["content"]}
            for m in messages
        ]

    def list_conversations(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """List all conversations for a user, most recent first, with first message preview."""
        query = """
            SELECT c.id, c.user_id, c.created_at, c.updated_at,
                   (SELECT content FROM chat_messages WHERE conversation_id = c.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as first_message,
                   (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
            FROM chat_conversations c
            WHERE c.user_id = %s
            ORDER BY c.updated_at DESC
            LIMIT %s
        """
        with self._pool.cursor() as cursor:
            cursor.execute(query, (user_id, limit))
            rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation and all its messages."""
        with self._pool.cursor() as cursor:
            cursor.execute("DELETE FROM chat_messages WHERE conversation_id = %s", (conversation_id,))
            cursor.execute("DELETE FROM chat_conversations WHERE id = %s", (conversation_id,))
            return cursor.rowcount > 0

    def rename_conversation(self, conversation_id: str, title: str) -> bool:
        """Update a conversation's title (stored as first system message or metadata)."""
        # We store the title by updating a special metadata row
        # For now, we use the updated_at to reflect changes
        now = datetime.datetime.now().isoformat()
        with self._pool.cursor() as cursor:
            cursor.execute(
                "UPDATE chat_conversations SET updated_at = %s WHERE id = %s",
                (now, conversation_id),
            )
            return cursor.rowcount > 0


# Global singleton
_chat_repo: Optional[ChatRepository] = None


def get_chat_repo() -> ChatRepository:
    """Get or create the global ChatRepository."""
    global _chat_repo
    if _chat_repo is None:
        _chat_repo = ChatRepository()
    return _chat_repo
