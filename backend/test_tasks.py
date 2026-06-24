"""Test task repository CRUD operations."""
import os, sys
# Clean up test DB
if os.path.exists("test_tasks.db"):
    os.remove("test_tasks.db")

from app.infrastructure.task_repository import TaskRepository

repo = TaskRepository(db_path="test_tasks.db")

# Test create
task = repo.create("agent-1", "Test task title", "P1")
assert task["agent_id"] == "agent-1"
assert task["title"] == "Test task title"
assert task["priority"] == "P1"
assert task["status"] == "QUEUED"
print(f"PASS: create - {task['id']}")

# Test get_by_id
fetched = repo.get_by_id(task["id"])
assert fetched is not None
assert fetched["title"] == "Test task title"
print(f"PASS: get_by_id")

# Test get_all
all_tasks = repo.get_all()
assert len(all_tasks) == 1
print(f"PASS: get_all - {len(all_tasks)} tasks")

# Test filter by agent_id
filtered = repo.get_all(agent_id="agent-1")
assert len(filtered) == 1
filtered = repo.get_all(agent_id="agent-2")
assert len(filtered) == 0
print(f"PASS: get_all with agent_id filter")

# Create more tasks
repo.create("agent-1", "Task 2", "P2")
repo.create("agent-2", "Task 3", "P3")
all_tasks = repo.get_all()
assert len(all_tasks) == 3
print(f"PASS: multiple creates - {len(all_tasks)} tasks")

# Test update_status to RUNNING
updated = repo.update_status(task["id"], "RUNNING")
assert updated["status"] == "RUNNING"
assert updated["started_at"] is not None
print(f"PASS: update_status to RUNNING")

# Test update_status to COMPLETED
updated = repo.update_status(task["id"], "COMPLETED", result="test result", tokens_used=1500)
assert updated["status"] == "COMPLETED"
assert updated["completed_at"] is not None
assert updated["result"] == "test result"
assert updated["tokens_used"] == 1500
assert updated["duration"] is not None
print(f"PASS: update_status to COMPLETED - duration: {updated['duration']}s, tokens: {updated['tokens_used']}")

# Test get_history
history = repo.get_history(page=1, page_size=2)
assert history["total"] == 3
assert len(history["tasks"]) == 2
assert history["total_pages"] == 2
print(f"PASS: get_history - page 1: {len(history['tasks'])} tasks, total: {history['total']}")

history2 = repo.get_history(page=2, page_size=2)
assert len(history2["tasks"]) == 1
print(f"PASS: get_history - page 2: {len(history2['tasks'])} tasks")

# Test get_history with filter
history_filtered = repo.get_history(agent_id="agent-1")
assert history_filtered["total"] == 2
print(f"PASS: get_history with agent filter")

# Test active task count
# agent-1: task1 is COMPLETED, "Task 2" is QUEUED → 1 active
# agent-2: "Task 3" is QUEUED → 1 active
count = repo.get_active_task_count("agent-1")
assert count == 1  # "Task 2" is still QUEUED
count2 = repo.get_active_task_count("agent-2")
assert count2 == 1  # Task 3 is still QUEUED
print(f"PASS: get_active_task_count - agent-1: {count}, agent-2: {count2}")

# Test get_all_active_task_counts
counts = repo.get_all_active_task_counts()
assert counts.get("agent-2") == 1
assert counts.get("agent-1") == 1
print(f"PASS: get_all_active_task_counts - {counts}")

# Cleanup
os.remove("test_tasks.db")
print("\nAll tests passed!")
