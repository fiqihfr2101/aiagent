from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List
from enum import Enum

class AgentStatus(Enum):
    ACTIVE = "active"
    SLEEPING = "sleeping"
    OFFLINE = "offline"

@dataclass
class Agent:
    id: str
    name: str
    role: str
    status: AgentStatus = AgentStatus.ACTIVE
    current_task: Optional[str] = None
    last_seen: datetime = field(default_factory=datetime.now)
    uptime: str = "100%"
    heartbeat: str = "0s"
    color: str = "#00D4AA"

@dataclass
class AgentTask:
    id: str
    agent_id: str
    title: str
    priority: str  # p1, p2, p3
    status: str    # queue, inprogress, review, done
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class MemoryEntry:
    id: str
    agent_id: str
    type: str  # fact, proc, ctx, ref
    title: str
    body: str
    timestamp: datetime = field(default_factory=datetime.now)
    source: str = "gbrain"
