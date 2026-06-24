"""Quick syntax check for backend Python files."""
import ast, sys

files = [
    "app/infrastructure/task_repository.py",
    "app/infrastructure/log_repository.py",
    "main.py",
    "workflows/agent_workflow.py",
    "activities/agent_activities.py",
    "worker.py",
]

for f in files:
    try:
        ast.parse(open(f).read())
        print(f"OK: {f}")
    except SyntaxError as e:
        print(f"FAIL: {f} - {e}")
        sys.exit(1)

print("All syntax checks passed.")
