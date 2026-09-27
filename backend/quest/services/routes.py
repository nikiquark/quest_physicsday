"""Route maintenance: which stations a phone participant must pass (order does not matter)."""

from quest.models import Participant, Station
from quest.services.state import StationSnapshot, visits_by_participant


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
        p.route = [*p.route, station.id]
        changed.append(p)
    Participant.objects.bulk_update(changed, ["route"])
    return changed
