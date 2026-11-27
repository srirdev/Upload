from app.modules.auth.deps import require_roles
from app.modules.auth.models import Role

admin_only = require_roles(Role.admin)
