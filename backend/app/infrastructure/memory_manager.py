import chromadb
from chromadb.config import Settings
import uuid
import datetime

class MemoryManager:
    def __init__(self, persist_directory="./data/chroma"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        # Collection for agent memories
        self.collection = self.client.get_or_create_collection(name="agent_memories")

    async def add_memory(self, agent_id, mem_type, title, body):
        """
        Types: fact, proc, ctx, ref
        """
        mem_id = str(uuid.uuid4())
        timestamp = datetime.datetime.now().isoformat()
        
        self.collection.add(
            ids=[mem_id],
            documents=[body],
            metadatas=[{
                "agent_id": agent_id,
                "type": mem_type,
                "title": title,
                "timestamp": timestamp,
                "source": "gbrain"
            }]
        )
        return {
            "id": mem_id,
            "agent_id": agent_id,
            "type": mem_type,
            "title": title,
            "body": body,
            "ts": "just now",
            "src": "gbrain"
        }

    async def query_memory(self, agent_id, query_text, n_results=5):
        results = self.collection.query(
            query_texts=[query_text],
            where={"agent_id": agent_id},
            n_results=n_results
        )
        
        memories = []
        if results['ids'][0]:
            for i in range(len(results['ids'][0])):
                meta = results['metadatas'][0][i]
                memories.append({
                    "id": results['ids'][0][i],
                    "type": meta['type'],
                    "title": meta['title'],
                    "body": results['documents'][0][i],
                    "ts": meta['timestamp'],
                    "src": meta['source']
                })
        return memories

    async def get_all_for_agent(self, agent_id):
        results = self.collection.get(
            where={"agent_id": agent_id}
        )
        memories = []
        if results['ids']:
            for i in range(len(results['ids'])):
                meta = results['metadatas'][i]
                memories.append({
                    "id": results['ids'][i],
                    "type": meta['type'],
                    "title": meta['title'],
                    "body": results['documents'][i],
                    "ts": meta['timestamp'],
                    "src": meta['source']
                })
        return memories
