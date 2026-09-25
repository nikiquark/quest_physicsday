"""Route generation and route maintenance when stations are added or re-enabled."""

import random
from collections import Counter

from quest.models import Participant, Station
from quest.services.state import StationSnapshot, visits_by_participant


def current_load() -> Counter:
    """Number of phone participants for whom each station is currently active."""
    rows = (
        Participant.objects.filter(kind=Participant.PHONE, prize_at__isnull=True)
        .exclude(current_station=None)
        .values_list("current_station_id", flat=True)
    )
    return Counter(rows)


def generate_route(station_ids: list[int], load: Counter, rng: random.Random | None = None) -> list[int]:
    """First station: least loaded right now (random among ties). The rest: random order."""
    rng = rng or random
    if not station_ids:
        return []
    min_load = min(load.get(sid, 0) for sid in station_ids)
    first = rng.choice([sid for sid in station_ids if load.get(sid, 0) == min_load])
    rest = [sid for sid in station_ids if sid != first]
    rng.shuffle(rest)
    return [first, *rest]


def insert_into_route(route: list[int], station_id: int, visited: set[int], rng=None) -> list[int]:
    """Insert the station at a random position among the not-yet-passed part of the route."""
    rng = rng or random
    first_pending = next((i for i, sid in enumerate(route) if sid not in visited), len(route))
    pos = rng.randint(first_pending, len(route))
    return [*route[:pos], station_id, *route[pos:]]


def add_station_to_routes(station: Station) -> list[Participant]:
    """Give the station to every phone participant who is still on the way. Returns changed ones."""
    snap = StationSnapshot.load()
    enabled = snap.enabled_ids
    candidates = list(
        Participant.objects.filter(kind=Participant.PHONE, prize_at__isnull=True).exclude(
            route__contains=[station.id]
        )
    )
    visits = visits_by_participant(p.id for p in candidates)
    changed = []
    for p in candidates:
        visited = set(visits[p.id])
        still_walking = any(sid in enabled and sid not in visited for sid in p.route if sid != station.id)
        if not still_walking:
            continue  # already heading to the finish — do not send them back
        p.route = insert_into_route(p.route, station.id, visited)
        changed.append(p)
    Participant.objects.bulk_update(changed, ["route"])
    return changed
