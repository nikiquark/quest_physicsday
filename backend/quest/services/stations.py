from django.db import transaction

from quest.models import Participant, Station
from quest.services.participants import QuestError
from quest.services.routes import add_station_to_routes
from quest.services.state import recompute_current

EDITABLE = ("name", "number", "description", "x", "y", "enabled")
FINISH_EDITABLE = ("name", "description", "x", "y")


def _clean(data: dict, allowed) -> dict:
    cleaned = {}
    for key in allowed:
        if key not in data:
            continue
        value = data[key]
        if key in ("x", "y"):
            value = min(1.0, max(0.0, float(value)))
        elif key == "number":
            value = max(0, int(value))
        elif key == "enabled":
            value = bool(value)
        else:
            value = str(value).strip()
        cleaned[key] = value
    if "name" in cleaned and not cleaned["name"]:
        raise QuestError("empty_name")
    return cleaned


def _refresh_all_current() -> None:
    recompute_current(Participant.objects.filter(prize_at__isnull=True))


def create_station(data: dict) -> Station:
    fields = _clean(data, EDITABLE)
    if "name" not in fields:
        raise QuestError("empty_name")
    with transaction.atomic():
        station = Station.objects.create(**fields)
        if station.enabled:
            add_station_to_routes(station)
        _refresh_all_current()
    return station


def update_station(station: Station, data: dict) -> Station:
    fields = _clean(data, FINISH_EDITABLE if station.is_finish else EDITABLE)
    with transaction.atomic():
        was_enabled = station.enabled
        for key, value in fields.items():
            setattr(station, key, value)
        station.save()
        if station.enabled != was_enabled:
            if station.enabled:
                add_station_to_routes(station)
            _refresh_all_current()
    return station
