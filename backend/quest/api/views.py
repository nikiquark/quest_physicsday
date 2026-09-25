from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from quest.api.auth import StaffView, client_ip, current_participant, error
from quest.models import Participant, Settings, StaffPin, Station
from quest.services import auth as auth_service
from quest.services import broadcast
from quest.services.participants import (
    QuestError,
    add_visit_manual,
    by_marker,
    register,
    remove_visit_manual,
)
from quest.services.prizes import grant_prize
from quest.services.seed import reset_quest
from quest.services.state import state_for, station_payload
from quest.services.stations import create_station, update_station
from quest.services.stats import dashboard_stats

STAFF_ROLES = (StaffPin.STATION, StaffPin.PRIZE, StaffPin.HELP)


def _with_cookie(response: Response, token: str) -> Response:
    response.set_cookie(
        settings.PARTICIPANT_COOKIE,
        token,
        max_age=7 * 24 * 3600,
        samesite="Lax",
        secure=not settings.DEBUG,
        httponly=True,
    )
    return response


# --- participant -----------------------------------------------------------------


class PublicStatusView(APIView):
    def get(self, request):
        return Response({"registration_open": Settings.load().registration_open})


class RegisterView(APIView):
    def post(self, request):
        existing = current_participant(request)
        if existing:
            return _with_cookie(Response({"token": existing.token, "state": state_for(existing)}), existing.token)
        try:
            participant = register(str(request.data.get("name", "")))
        except QuestError as exc:
            return error(exc.code, 409)
        broadcast.admin_dirty()
        return _with_cookie(
            Response({"token": participant.token, "state": state_for(participant)}, status=201),
            participant.token,
        )


class MeView(APIView):
    def get(self, request):
        participant = current_participant(request)
        if participant is None:
            return error("unknown_participant", 401)
        return _with_cookie(Response({"token": participant.token, "state": state_for(participant)}), participant.token)


# --- staff ---------------------------------------------------------------------------


class LoginView(APIView):
    def post(self, request):
        try:
            role, token = auth_service.login(str(request.data.get("pin", "")), client_ip(request))
        except auth_service.TooManyAttempts as exc:
            return error(exc.code, 429)
        except QuestError as exc:
            return error(exc.code, 403)
        return Response({"role": role, "token": token})


class StaffMeView(StaffView):
    roles = STAFF_ROLES

    def get(self, request):
        return Response({"role": request.staff_role})


class StationListView(StaffView):
    roles = STAFF_ROLES

    def get(self, request):
        return Response([{**station_payload(s), "enabled": s.enabled} for s in Station.objects.all()])


class MarkerView(StaffView):
    roles = (StaffPin.PRIZE, StaffPin.HELP)

    def get(self, request, marker_id: int):
        return Response(state_for(by_marker(marker_id)))


class PrizeView(StaffView):
    roles = (StaffPin.PRIZE,)

    def post(self, request, marker_id: int):
        participant = grant_prize(by_marker(marker_id), force=bool(request.data.get("force")))
        broadcast.push_states([participant])
        return Response(state_for(participant))


# --- admin -----------------------------------------------------------------------------


class AdminView(StaffView):
    roles = ()


class StatsView(AdminView):
    def get(self, request):
        return Response(dashboard_stats())


class AdminStationsView(AdminView):
    def post(self, request):
        station = create_station(request.data)
        broadcast.refresh_all_participants()
        return Response({**station_payload(station), "enabled": station.enabled}, status=201)


class AdminStationView(AdminView):
    def patch(self, request, station_id: int):
        station = get_object_or_404(Station, pk=station_id)
        was_enabled = station.enabled
        station = update_station(station, request.data)
        if station.enabled != was_enabled:
            broadcast.refresh_all_participants()
        else:
            broadcast.patch_station(station_payload(station))
        return Response({**station_payload(station), "enabled": station.enabled})


def _participant_detail(participant: Participant) -> dict:
    events = participant.events.select_related("station")[:50]
    return {
        "state": state_for(participant),
        "token": participant.token,
        "created_at": participant.created_at.isoformat(),
        "activated_at": participant.activated_at.isoformat() if participant.activated_at else None,
        "events": [
            {
                "kind": e.kind,
                "station": e.station.name if e.station else None,
                "created_at": e.created_at.isoformat(),
            }
            for e in events
        ],
    }


class AdminParticipantView(AdminView):
    def get(self, request, marker_id: int):
        return Response(_participant_detail(by_marker(marker_id)))


class AdminVisitsView(AdminView):
    def post(self, request, marker_id: int):
        participant = by_marker(marker_id)
        station = get_object_or_404(Station, pk=request.data.get("station_id"), is_finish=False)
        add_visit_manual(participant, station)
        broadcast.push_states([participant])
        return Response(_participant_detail(participant))


class AdminVisitView(AdminView):
    def delete(self, request, marker_id: int, station_id: int):
        participant = by_marker(marker_id)
        station = get_object_or_404(Station, pk=station_id)
        remove_visit_manual(participant, station)
        broadcast.push_states([participant])
        return Response(_participant_detail(participant))


class AdminSettingsView(AdminView):
    def _payload(self):
        return {
            "registration_open": Settings.load().registration_open,
            "pins": {p.role: p.pin for p in StaffPin.objects.all()},
        }

    def get(self, request):
        return Response(self._payload())

    def patch(self, request):
        if "registration_open" in request.data:
            Settings.objects.filter(pk=1).update(registration_open=bool(request.data["registration_open"]))
            broadcast.admin_dirty()
        if "pins" in request.data:
            auth_service.set_pins(dict(request.data["pins"]))
        return Response(self._payload())


class AdminResetView(AdminView):
    def post(self, request):
        if not auth_service.check_admin_pin(str(request.data.get("pin", ""))):
            return error("invalid_pin", 403)
        reset_quest()
        broadcast.reset_all_participants()
        return Response({"ok": True})

