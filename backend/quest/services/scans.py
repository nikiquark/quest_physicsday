"""Station scanning: bulk, idempotent marking of visits."""

from django.db import transaction
from django.utils import timezone

from quest.models import Participant, Station, Visit
from quest.services.state import StationSnapshot, recompute_current

ACCEPTED = "accepted"
ALREADY = "already"
UNKNOWN = "unknown"
DISABLED = "disabled"


def process_scan(station_id: int, raw_ids) -> tuple[list[dict], list[Participant]]:
    """Mark the station as passed for every scanned marker.

    Returns per-marker results and the participants whose state changed.
    Safe to call repeatedly with the same ids (offline queue re-sends).
    """
    ids = []
    for raw in raw_ids:
        if isinstance(raw, int) and not isinstance(raw, bool) and 0 <= raw < 1000 and raw not in ids:
            ids.append(raw)

    station = Station.objects.filter(pk=station_id).first()
    if station is None or not station.enabled or station.is_finish:
        return [{"id": i, "status": DISABLED} for i in ids], []

    with transaction.atomic():
        participants = {p.marker_id: p for p in Participant.objects.filter(marker_id__in=ids)}
        already = set(
            Visit.objects.filter(participant__in=participants.values(), station=station).values_list(
                "participant__marker_id", flat=True
            )
        )
        new = [participants[i] for i in ids if i in participants and i not in already]
        Visit.objects.bulk_create(
            [Visit(participant=p, station=station, source=Visit.SCAN) for p in new],
            ignore_conflicts=True,
        )
        now = timezone.now()
        to_activate = [p for p in new if p.activated_at is None]
        for p in to_activate:
            p.activated_at = now
        Participant.objects.bulk_update(to_activate, ["activated_at"])
        recompute_current(new, StationSnapshot.load())

    results = []
    for i in ids:
        if i not in participants:
            status = UNKNOWN
        elif i in already:
            status = ALREADY
        else:
            status = ACCEPTED
        results.append({"id": i, "status": status})
    return results, new
