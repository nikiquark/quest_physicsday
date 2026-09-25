import secrets

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from quest.models import PHONE_MARKERS, EventLog, Participant, Settings, Station, Visit
from quest.services.routes import current_load, generate_route
from quest.services.state import StationSnapshot, recompute_current


class QuestError(Exception):
    code = "error"

    def __init__(self, message: str = ""):
        super().__init__(message or self.code)


class RegistrationClosed(QuestError):
    code = "registration_closed"


class NoMarkersLeft(QuestError):
    code = "no_markers_left"


class UnknownMarker(QuestError):
    code = "unknown_marker"


def register(name: str) -> Participant:
    name = name.strip()[:50]
    if not name:
        raise QuestError("empty_name")
    with transaction.atomic():
        settings = Settings.objects.select_for_update().get(pk=1)
        if not settings.registration_open:
            raise RegistrationClosed()
        last = Participant.objects.filter(kind=Participant.PHONE).aggregate(m=Max("marker_id"))["m"]
        marker_id = PHONE_MARKERS.start if last is None else last + 1
        if marker_id not in PHONE_MARKERS:
            raise NoMarkersLeft()
        snap = StationSnapshot.load()
        route = generate_route([s.id for s in snap.stations], current_load())
        return Participant.objects.create(
            kind=Participant.PHONE,
            marker_id=marker_id,
            name=name,
            token=secrets.token_urlsafe(24),
            route=route,
            current_station_id=route[0] if route else snap.finish.id,
            activated_at=timezone.now(),
        )


def by_token(token: str | None) -> Participant | None:
    if not token:
        return None
    return Participant.objects.filter(token=token).first()


def by_marker(marker_id: int) -> Participant:
    participant = Participant.objects.filter(marker_id=marker_id).first()
    if participant is None:
        raise UnknownMarker()
    return participant


def add_visit_manual(participant: Participant, station: Station) -> None:
    _, created = Visit.objects.get_or_create(
        participant=participant, station=station, defaults={"source": Visit.MANUAL}
    )
    if created:
        if participant.activated_at is None:
            participant.activated_at = timezone.now()
            participant.save(update_fields=["activated_at"])
        EventLog.objects.create(kind=EventLog.VISIT_ADDED, participant=participant, station=station)
        recompute_current([participant])


def remove_visit_manual(participant: Participant, station: Station) -> None:
    deleted, _ = Visit.objects.filter(participant=participant, station=station).delete()
    if deleted:
        EventLog.objects.create(kind=EventLog.VISIT_REMOVED, participant=participant, station=station)
        recompute_current([participant])
