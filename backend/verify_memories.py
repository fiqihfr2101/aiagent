import chromadb

client = chromadb.PersistentClient(path='./data/chroma')
collection = client.get_collection('agent_memories')
print(f'Total items in collection: {collection.count()}')

agents = [
    ('fiqih_b331b4', 'HILMAN'),
    ('hilman_5905b7', 'BAHLIL'),
    ('deden_036688', 'DEDEN'),
    ('teddy_3ac903', 'TEDDY'),
    ('budi_41a92b', 'BUDI'),
]

for agent_id, name in agents:
    results = collection.get(where={'agent_id': agent_id}, limit=1000)
    kb_count = sum(1 for m in results.get('metadatas', []) if m.get('source') == 'knowledge-loader')
    total = len(results.get('ids', []))
    print(f'  {name} ({agent_id}): {total} total, {kb_count} from knowledge base')
