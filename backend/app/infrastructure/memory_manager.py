import chromadb
from chromadb.config import Settings
import uuid
import datetime
import math
from typing import Optional, List, Dict, Any


class MemoryManager:
    """Advanced memory manager with semantic search, lifecycle management,
    consolidation, importance scoring, and cross-agent sharing."""

    # TTL defaults (in days) per memory type
    DEFAULT_TTL: Dict[str, int] = {
        "fact": 365,
        "proc": 180,
        "ctx": 30,
        "ref": 90,
    }

    def __init__(self, persist_directory="./data/chroma"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        # Main collection for agent memories
        self.collection = self.client.get_or_create_collection(
            name="agent_memories",
            metadata={"hnsw:space": "cosine"},
        )
        # Shared knowledge pool accessible by all agents
        self.shared_pool = self.client.get_or_create_collection(
            name="shared_memories",
            metadata={"hnsw:space": "cosine"},
        )

    # ── Core CRUD ─────────────────────────────────────────────────

    async def add_memory(
        self,
        agent_id: str,
        mem_type: str,
        title: str,
        body: str,
        *,
        ttl_days: Optional[int] = None,
        importance: float = 0.5,
        shared: bool = False,
        source_agent_id: Optional[str] = None,
    ) -> dict:
        """Add a memory with lifecycle metadata."""
        mem_id = str(uuid.uuid4())
        now = datetime.datetime.now(datetime.timezone.utc)
        ttl = ttl_days if ttl_days is not None else self.DEFAULT_TTL.get(mem_type, 90)
        expires_at = (now + datetime.timedelta(days=ttl)).isoformat()

        metadata = {
            "agent_id": agent_id,
            "type": mem_type,
            "title": title,
            "timestamp": now.isoformat(),
            "source": source_agent_id or "gbrain",
            "importance": importance,
            "access_count": 0,
            "last_accessed": now.isoformat(),
            "ttl_days": ttl,
            "expires_at": expires_at,
            "archived": False,
            "shared": shared,
            "consolidated_from": "",
        }

        collection = self.shared_pool if shared else self.collection
        collection.add(ids=[mem_id], documents=[body], metadatas=[metadata])

        return {
            "id": mem_id,
            "agent_id": agent_id,
            "type": mem_type,
            "title": title,
            "body": body,
            "ts": "just now",
            "src": source_agent_id or "gbrain",
            "importance": importance,
            "shared": shared,
            "expires_at": expires_at,
        }

    async def query_memory(self, agent_id: str, query_text: str, n_results: int = 5) -> list:
        """Query memories using vector similarity (semantic search)."""
        results = self.collection.query(
            query_texts=[query_text],
            where={"$and": [{"agent_id": agent_id}, {"archived": False}]},
            n_results=n_results,
        )

        memories = []
        if results["ids"][0]:
            for i in range(len(results["ids"][0])):
                meta = results["metadatas"][0][i]
                # Bump access count
                self._touch_memory(results["ids"][0][i], meta)
                distance = results["distances"][0][i] if results.get("distances") else 0
                relevance = max(0, 1 - distance)  # cosine distance → similarity
                memories.append({
                    "id": results["ids"][0][i],
                    "type": meta["type"],
                    "title": meta["title"],
                    "body": results["documents"][0][i],
                    "ts": meta["timestamp"],
                    "src": meta.get("source", "gbrain"),
                    "importance": meta.get("importance", 0.5),
                    "relevance": round(relevance, 4),
                    "shared": meta.get("shared", False),
                    "expires_at": meta.get("expires_at"),
                })
        return memories

    async def get_all_for_agent(self, agent_id: str, include_archived: bool = False) -> list:
        """Get all memories for an agent."""
        where = {"agent_id": agent_id}
        if not include_archived:
            where["archived"] = False

        results = self.collection.get(where=where)
        memories = []
        if results["ids"]:
            for i in range(len(results["ids"])):
                meta = results["metadatas"][i]
                memories.append({
                    "id": results["ids"][i],
                    "type": meta["type"],
                    "title": meta["title"],
                    "body": results["documents"][i],
                    "ts": meta["timestamp"],
                    "src": meta.get("source", "gbrain"),
                    "importance": meta.get("importance", 0.5),
                    "shared": meta.get("shared", False),
                    "archived": meta.get("archived", False),
                    "expires_at": meta.get("expires_at"),
                })
        return memories

    # ── Semantic Search ───────────────────────────────────────────

    async def semantic_search(
        self,
        query_text: str,
        agent_id: Optional[str] = None,
        mem_type: Optional[str] = None,
        include_shared: bool = True,
        include_archived: bool = False,
        n_results: int = 10,
    ) -> list:
        """Semantic search across memories with filters."""
        # Build where filter
        conditions = []
        if agent_id:
            conditions.append({"agent_id": agent_id})
        if mem_type:
            conditions.append({"type": mem_type})
        if not include_archived:
            conditions.append({"archived": False})

        where = {"$and": conditions} if len(conditions) > 1 else (conditions[0] if conditions else None)

        # Search private memories
        all_results = []
        try:
            results = self.collection.query(
                query_texts=[query_text],
                where=where,
                n_results=n_results,
            )
            if results["ids"][0]:
                for i in range(len(results["ids"][0])):
                    meta = results["metadatas"][0][i]
                    distance = results["distances"][0][i] if results.get("distances") else 0
                    all_results.append({
                        "id": results["ids"][0][i],
                        "agent_id": meta["agent_id"],
                        "type": meta["type"],
                        "title": meta["title"],
                        "body": results["documents"][0][i],
                        "ts": meta["timestamp"],
                        "src": meta.get("source", "gbrain"),
                        "importance": meta.get("importance", 0.5),
                        "relevance": round(max(0, 1 - distance), 4),
                        "shared": False,
                    })
        except Exception:
            pass

        # Search shared pool
        if include_shared:
            try:
                shared_where = None
                if mem_type:
                    shared_where = {"type": mem_type}
                shared_results = self.shared_pool.query(
                    query_texts=[query_text],
                    where=shared_where,
                    n_results=n_results,
                )
                if shared_results["ids"][0]:
                    for i in range(len(shared_results["ids"][0])):
                        meta = shared_results["metadatas"][0][i]
                        distance = shared_results["distances"][0][i] if shared_results.get("distances") else 0
                        all_results.append({
                            "id": shared_results["ids"][0][i],
                            "agent_id": meta["agent_id"],
                            "type": meta["type"],
                            "title": meta["title"],
                            "body": shared_results["documents"][0][i],
                            "ts": meta["timestamp"],
                            "src": meta.get("source", "gbrain"),
                            "importance": meta.get("importance", 0.5),
                            "relevance": round(max(0, 1 - distance), 4),
                            "shared": True,
                        })
            except Exception:
                pass

        # Sort by relevance * importance
        all_results.sort(key=lambda x: x["relevance"] * x["importance"], reverse=True)
        return all_results[:n_results]

    # ── Cross-Agent Sharing ───────────────────────────────────────

    async def share_memory(self, memory_id: str, from_agent_id: str, to_agent_id: str) -> dict:
        """Share a memory from one agent to another (copy with provenance)."""
        # Get the original memory
        results = self.collection.get(ids=[memory_id])
        if not results["ids"]:
            return {"error": "Memory not found"}

        meta = results["metadatas"][0]
        body = results["documents"][0]

        # Verify ownership
        if meta["agent_id"] != from_agent_id:
            return {"error": "Memory does not belong to source agent"}

        # Create a shared copy for the target agent
        new_mem = await self.add_memory(
            agent_id=to_agent_id,
            mem_type=meta["type"],
            title=meta["title"],
            body=body,
            ttl_days=meta.get("ttl_days"),
            importance=meta.get("importance", 0.5),
            shared=True,
            source_agent_id=from_agent_id,
        )

        # Also add to shared pool
        shared_id = str(uuid.uuid4())
        now = datetime.datetime.now(datetime.timezone.utc)
        shared_meta = {
            **meta,
            "agent_id": to_agent_id,
            "shared": True,
            "source": from_agent_id,
            "timestamp": now.isoformat(),
        }
        self.shared_pool.add(ids=[shared_id], documents=[body], metadatas=[shared_meta])

        return {
            "status": "shared",
            "original_id": memory_id,
            "new_memory": new_mem,
            "from_agent": from_agent_id,
            "to_agent": to_agent_id,
        }

    async def get_shared_memories(self, agent_id: Optional[str] = None) -> list:
        """Get all shared memories, optionally filtered by agent."""
        where = {"agent_id": agent_id} if agent_id else None
        results = self.shared_pool.get(where=where)
        memories = []
        if results["ids"]:
            for i in range(len(results["ids"])):
                meta = results["metadatas"][i]
                memories.append({
                    "id": results["ids"][i],
                    "agent_id": meta["agent_id"],
                    "type": meta["type"],
                    "title": meta["title"],
                    "body": results["documents"][i],
                    "ts": meta["timestamp"],
                    "src": meta.get("source", "gbrain"),
                    "importance": meta.get("importance", 0.5),
                    "shared": True,
                })
        return memories

    # ── Memory Lifecycle (Archive / TTL) ──────────────────────────

    async def archive_old_memories(self, agent_id: str, older_than_days: int = 30) -> dict:
        """Archive memories older than specified days."""
        results = self.collection.get(where={"agent_id": agent_id, "archived": False})
        archived_count = 0
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=older_than_days)

        if results["ids"]:
            for i, mem_id in enumerate(results["ids"]):
                meta = results["metadatas"][i]
                ts = meta.get("timestamp", "")
                try:
                    mem_time = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    if mem_time < cutoff:
                        meta["archived"] = True
                        meta["archived_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        self.collection.update(ids=[mem_id], metadatas=[meta])
                        archived_count += 1
                except (ValueError, TypeError):
                    continue

        return {
            "agent_id": agent_id,
            "archived_count": archived_count,
            "cutoff_days": older_than_days,
        }

    async def expire_memories(self) -> dict:
        """Archive all memories past their TTL."""
        expired_count = 0
        now = datetime.datetime.now(datetime.timezone.utc)

        for collection in [self.collection, self.shared_pool]:
            results = collection.get(where={"archived": False})
            if results["ids"]:
                for i, mem_id in enumerate(results["ids"]):
                    meta = results["metadatas"][i]
                    expires_at = meta.get("expires_at", "")
                    try:
                        exp_time = datetime.datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                        if now > exp_time:
                            meta["archived"] = True
                            meta["archived_at"] = now.isoformat()
                            collection.update(ids=[mem_id], metadatas=[meta])
                            expired_count += 1
                    except (ValueError, TypeError):
                        continue

        return {"expired_count": expired_count}

    # ── Memory Consolidation ──────────────────────────────────────

    async def consolidate_similar(self, agent_id: str, similarity_threshold: float = 0.85) -> dict:
        """Find and merge similar memories for an agent."""
        results = self.collection.get(where={"agent_id": agent_id, "archived": False})
        if not results["ids"] or len(results["ids"]) < 2:
            return {"agent_id": agent_id, "merged_count": 0, "memories_remaining": len(results["ids"] or [])}

        memories = []
        for i in range(len(results["ids"])):
            memories.append({
                "id": results["ids"][i],
                "meta": results["metadatas"][i],
                "doc": results["documents"][i],
            })

        # Use ChromaDB query to find similar pairs
        merged_ids = set()
        merge_groups = []

        for mem in memories:
            if mem["id"] in merged_ids:
                continue

            # Query for similar memories
            similar = self.collection.query(
                query_texts=[mem["doc"]],
                where={"$and": [{"agent_id": agent_id}, {"archived": False}]},
                n_results=5,
            )

            group = [mem]
            if similar["ids"][0]:
                for j in range(len(similar["ids"][0])):
                    sim_id = similar["ids"][0][j]
                    distance = similar["distances"][0][j] if similar.get("distances") else 1
                    similarity = 1 - distance

                    if sim_id != mem["id"] and sim_id not in merged_ids and similarity >= similarity_threshold:
                        group.append({
                            "id": sim_id,
                            "meta": similar["metadatas"][0][j],
                            "doc": similar["documents"][0][j],
                        })

            if len(group) > 1:
                merge_groups.append(group)
                for g in group:
                    merged_ids.add(g["id"])

        # Perform merges
        consolidated_count = 0
        for group in merge_groups:
            # Keep the most important memory as the base
            group.sort(key=lambda x: x["meta"].get("importance", 0.5), reverse=True)
            primary = group[0]
            others = group[1:]

            # Combine bodies
            combined_body = primary["doc"]
            for other in others:
                if other["doc"] not in combined_body:
                    combined_body += f"\n---\n{other['doc']}"

            # Update importance (boost for consolidated)
            new_importance = min(1.0, primary["meta"].get("importance", 0.5) + 0.1)

            # Track consolidation provenance
            consolidated_from = [primary["id"]] + [o["id"] for o in others]

            # Update primary memory
            primary["meta"]["importance"] = new_importance
            primary["meta"]["consolidated_from"] = ",".join(consolidated_from)
            primary["meta"]["last_consolidated"] = datetime.datetime.now(datetime.timezone.utc).isoformat()

            self.collection.update(
                ids=[primary["id"]],
                documents=[combined_body],
                metadatas=[primary["meta"]],
            )

            # Archive the duplicates
            for other in others:
                other["meta"]["archived"] = True
                other["meta"]["archived_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                other["meta"]["merged_into"] = primary["id"]
                self.collection.update(ids=[other["id"]], metadatas=[other["meta"]])

            consolidated_count += len(others)

        remaining = self.collection.get(where={"agent_id": agent_id, "archived": False})
        return {
            "agent_id": agent_id,
            "merged_count": consolidated_count,
            "groups_merged": len(merge_groups),
            "memories_remaining": len(remaining["ids"] if remaining["ids"] else []),
        }

    # ── Importance Scoring ────────────────────────────────────────

    async def update_importance(self, memory_id: str, new_importance: float) -> dict:
        """Manually update importance score."""
        new_importance = max(0.0, min(1.0, new_importance))
        for collection in [self.collection, self.shared_pool]:
            results = collection.get(ids=[memory_id])
            if results["ids"]:
                meta = results["metadatas"][0]
                old = meta.get("importance", 0.5)
                meta["importance"] = new_importance
                collection.update(ids=[memory_id], metadatas=[meta])
                return {"id": memory_id, "old_importance": old, "new_importance": new_importance}
        return {"error": "Memory not found"}

    async def recalculate_importance(self, agent_id: str) -> dict:
        """Recalculate importance scores based on access patterns and age."""
        results = self.collection.get(where={"agent_id": agent_id, "archived": False})
        updated = 0

        if results["ids"]:
            now = datetime.datetime.now(datetime.timezone.utc)
            for i, mem_id in enumerate(results["ids"]):
                meta = results["metadatas"][i]
                access_count = meta.get("access_count", 0)
                importance = meta.get("importance", 0.5)

                # Factor in access frequency
                access_boost = min(0.3, access_count * 0.02)

                # Factor in age (newer = slightly higher)
                try:
                    ts = datetime.datetime.fromisoformat(meta["timestamp"].replace("Z", "+00:00"))
                    age_days = (now - ts).days
                    age_factor = max(0.0, 1 - (age_days / 365) * 0.2)
                except (ValueError, TypeError):
                    age_factor = 1.0

                new_importance = min(1.0, max(0.0, importance + access_boost) * age_factor)
                if abs(new_importance - importance) > 0.01:
                    meta["importance"] = round(new_importance, 4)
                    self.collection.update(ids=[mem_id], metadatas=[meta])
                    updated += 1

        return {"agent_id": agent_id, "updated": updated}

    # ── Memory Statistics ─────────────────────────────────────────

    async def get_stats(self, agent_id: str) -> dict:
        """Get comprehensive memory statistics for an agent."""
        all_mem = self.collection.get(where={"agent_id": agent_id})
        active_mem = self.collection.get(where={"agent_id": agent_id, "archived": False})
        archived_mem = self.collection.get(where={"agent_id": agent_id, "archived": True})

        # Type breakdown
        type_counts: Dict[str, int] = {"fact": 0, "proc": 0, "ctx": 0, "ref": 0}
        total_importance = 0.0
        shared_count = 0
        total_access = 0

        if active_mem["metadatas"]:
            for meta in active_mem["metadatas"]:
                mtype = meta.get("type", "fact")
                type_counts[mtype] = type_counts.get(mtype, 0) + 1
                total_importance += meta.get("importance", 0.5)
                total_access += meta.get("access_count", 0)
                if meta.get("shared", False):
                    shared_count += 1

        active_count = len(active_mem["ids"] if active_mem["ids"] else [])
        avg_importance = total_importance / active_count if active_count > 0 else 0

        # Get shared memories count for this agent
        try:
            shared_results = self.shared_pool.get(where={"agent_id": agent_id})
            shared_in_pool = len(shared_results["ids"] if shared_results["ids"] else [])
        except Exception:
            shared_in_pool = 0

        return {
            "agent_id": agent_id,
            "total": len(all_mem["ids"] if all_mem["ids"] else []),
            "active": active_count,
            "archived": len(archived_mem["ids"] if archived_mem["ids"] else []),
            "shared": shared_count,
            "shared_pool": shared_in_pool,
            "by_type": type_counts,
            "avg_importance": round(avg_importance, 4),
            "total_accesses": total_access,
        }

    # ── Internal Helpers ──────────────────────────────────────────

    def _touch_memory(self, memory_id: str, meta: dict):
        """Increment access count and update last_accessed."""
        try:
            meta["access_count"] = meta.get("access_count", 0) + 1
            meta["last_accessed"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.collection.update(ids=[memory_id], metadatas=[meta])
        except Exception:
            pass  # Non-critical, don't fail queries
