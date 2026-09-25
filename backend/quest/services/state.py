"""Derived participant state: current station, completion, and the payload sent to clients."""

from collections import defaultdict
from dataclasses import dataclass

from quest.models import Participant, Station, Visit


@dataclass
class StationSnapshot:
    stations: list[Station]  # enabled, non-finish, in display order
    finish: Station

    @property
    def enabled_ids(self) -> set[int]:
        return {s.id for s in self.stations}

    @classmethod
    def load(cls) -> "StationSnapshot":
        stations = list(Station.objects.filter(enabled=True))
        finish = next(s for s in stations if s.is_finish)
        return cls(stations=[s for s in stations if not s.is_finish], finish=finish)


def required_station_ids(participant: Participant, snap: StationSnapshot) -> list[int]:
    """Stations the participant must pass, in their order (phone: route order)."""
    enabled = snap.enabled_ids
    if participant.kind == Participant.PAPER:
        return [s.id for s in snap.stations]
    return [sid for sid in participant.route if sid in enabled]


def compute_current_id(participant: Participant, visited: set[int], snap: StationSnapshot) -> int | None:
    if participant.prize_at:
        return None
    required = required_station_ids(participant, snap)
    pending = [sid for sid in required if sid not in visited]
    if not pending:
        return snap.finish.id
    if participant.kind == Participant.PAPER:
        return None  # paper participants have no route, any order
    return pending[0]


def is_all_done(participant: Participant, visited: set[int], snap: StationSnapshot) -> bool:
    return all(sid in visited for sid in required_station_ids(participant, snap))


def visits_by_participant(participant_ids) -> dict[int, dict[int, "Visit"]]:
    result: dict[int, dict[int, Visit]] = defaultdict(dict)
    for visit in Visit.objects.filter(participant_id__in=list(participant_ids)):
        result[visit.participant_id][visit.station_id] = visit
    return result


def recompute_current(participants, snap: StationSnapshot | None = None) -> None:
    """Refresh the denormalized current_station for the given participants."""
    participants = list(participants)
    if not participants:
        return
    snap = snap or StationSnapshot.load()
    visits = visits_by_participant(p.id for p in participants)
    changed = []
    for p in participants:
        new_id = compute_current_id(p, set(visits[p.id]), snap)
        if new_id != p.current_station_id:
            p.current_station_id = new_id
            changed.append(p)
    if changed:
        Participant.objects.bulk_update(changed, ["current_station"])


def station_payload(station: Station) -> dict:
    return {
        "id": station.id,
        "name": station.name,
        "number": station.number,
        "description": station.description,
        "x": station.x,
        "y": station.y,
        "is_finish": station.is_finish,
    }


def build_state(participant: Participant, visits: dict[int, Visit], snap: StationSnapshot) -> dict:
    visited = set(visits)
    by_id = {s.id: s for s in snap.stations}
    order = required_station_ids(participant, snap)
    # Stations visited outside the route (e.g. manual marks) are still shown.
    order += [s.id for s in snap.stations if s.id in visited and s.id not in order]

    stations = []
    for sid in order:
        item = station_payload(by_id[sid])
        visit = visits.get(sid)
        item["visited"] = visit is not None
        item["visited_at"] = visit.created_at.isoformat() if visit else None
        stations.append(item)
    finish = station_payload(snap.finish)
    finish["visited"] = participant.prize_at is not None
    finish["visited_at"] = participant.prize_at.isoformat() if participant.prize_at else None
    stations.append(finish)

    return {
        "participant": {
            "marker_id": participant.marker_id,
            "name": participant.name,
            "display_name": participant.display_name,
            "kind": participant.kind,
            "activated": participant.activated_at is not None,
            "all_done": is_all_done(participant, visited, snap),
            "current_station_id": compute_current_id(participant, visited, snap),
            "prize_at": participant.prize_at.isoformat() if participant.prize_at else None,
            "prize_forced": participant.prize_forced,
        },
        "stations": stations,
    }


def states_for(participants) -> dict[int, dict]:
    """Build client states for several participants with a constant number of queries."""
    participants = list(participants)
    if not participants:
        return {}
    snap = StationSnapshot.load()
    visits = visits_by_participant(p.id for p in participants)
    return {p.id: build_state(p, visits[p.id], snap) for p in participants}


def state_for(participant: Participant) -> dict:
    return states_for([participant])[participant.id]
