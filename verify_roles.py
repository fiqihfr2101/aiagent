import sys
sys.path.insert(0, 'backend')
from app.interfaces.roles import get_all_roles, get_role_by_id

roles = get_all_roles()
print(f'Total roles: {len(roles)}')
for r in roles:
    print(f"  - {r['id']}: {r['name']}")
    
pm = get_role_by_id('project_manager')
if pm:
    print(f"\nProject Manager role found:")
    print(f"  Color: {pm['color']}")
    print(f"  Icon: {pm['icon']}")
else:
    print('ERROR: Project Manager role not found!')
