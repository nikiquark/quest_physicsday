"""Staff PIN login. A PIN identifies the role; tokens are invalidated by bumping the role's version."""

import re

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.db import transaction

from quest.models import StaffPin
from quest.services.participants import QuestError

PIN_RE = re.compile(r"^\d{4,8}$")
TOKEN_SALT = "quest.staff"


class TooManyAttempts(QuestError):
    code = "too_many_attempts"


class InvalidPin(QuestError):
    code = "invalid_pin"


def _check_rate(ip: str) -> None:
    key = f"pin-attempts:{ip}"
    cache.add(key, 0, timeout=60)
    try:
        attempts = cache.incr(key)
    except ValueError:  # key expired between add and incr
        cache.set(key, 1, timeout=60)
        attempts = 1
    if attempts > settings.PIN_ATTEMPTS_PER_MINUTE:
        raise TooManyAttempts()


def make_token(pin: StaffPin) -> str:
    return signing.dumps({"role": pin.role, "v": pin.version}, salt=TOKEN_SALT)


def login(pin: str, ip: str) -> tuple[str, str]:
    _check_rate(ip)
    staff_pin = StaffPin.objects.filter(pin=str(pin)).first() if PIN_RE.match(str(pin)) else None
    if staff_pin is None:
        raise InvalidPin()
    return staff_pin.role, make_token(staff_pin)


def role_from_token(token: str | None) -> str | None:
    if not token:
        return None
    try:
        data = signing.loads(token, salt=TOKEN_SALT, max_age=settings.STAFF_TOKEN_MAX_AGE)
    except signing.BadSignature:
        return None
    if StaffPin.objects.filter(role=data.get("role"), version=data.get("v")).exists():
        return data["role"]
    return None


def check_admin_pin(pin: str) -> bool:
    return StaffPin.objects.filter(role=StaffPin.ADMIN, pin=str(pin)).exists()


def set_pins(new_pins: dict[str, str]) -> None:
    """Change PINs of several roles at once; all PINs must stay unique."""
    with transaction.atomic():
        current = {p.role: p for p in StaffPin.objects.select_for_update()}
        merged = {role: p.pin for role, p in current.items()}
        for role, pin in new_pins.items():
            if role not in current:
                raise QuestError("unknown_role")
            if not PIN_RE.match(str(pin)):
                raise QuestError("pin_format")
            merged[role] = str(pin)
        if len(set(merged.values())) != len(merged):
            raise QuestError("pin_not_unique")
        for role, pin in new_pins.items():
            obj = current[role]
            if obj.pin != str(pin):
                obj.pin = str(pin)
                obj.version += 1
                obj.save()
