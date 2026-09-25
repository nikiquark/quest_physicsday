from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

from quest.models import StaffPin
from quest.services import auth as auth_service
from quest.services.participants import QuestError, by_token


def client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def participant_token(request) -> str | None:
    return request.headers.get("X-Participant-Token") or request.COOKIES.get(settings.PARTICIPANT_COOKIE)


def current_participant(request):
    return by_token(participant_token(request))


def staff_role(request) -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Staff "):
        return None
    return auth_service.role_from_token(header[len("Staff ") :])


def error(code: str, status: int = 400) -> Response:
    return Response({"code": code}, status=status)


class StaffView(APIView):
    """Base view: requires a staff token with one of `roles` (admin is always allowed)."""

    roles: tuple[str, ...] = ()

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        role = staff_role(request)
        request.staff_role = role
        if role is None or (role != StaffPin.ADMIN and role not in self.roles):
            self.permission_denied(request, message="staff_only")

    def handle_exception(self, exc):
        if isinstance(exc, QuestError):
            return error(exc.code, 409)
        return super().handle_exception(exc)
