"""Imports every model module so Alembic autogenerate sees all tables."""
from app.db.session import Base  # noqa: F401
from app.modules.auth import models as auth_models  # noqa: F401
from app.modules.colleges import models as college_models  # noqa: F401
from app.modules.finance import models as finance_models  # noqa: F401
from app.modules.notifications import models as notification_models  # noqa: F401
from app.modules.orders import models as order_models  # noqa: F401
from app.modules.payments import models as payment_models  # noqa: F401
from app.modules.students import models as student_models  # noqa: F401
from app.modules.shops import models as shop_models  # noqa: F401
from app.modules.delivery import models as delivery_models  # noqa: F401
from app.modules.riders import models as rider_models  # noqa: F401
