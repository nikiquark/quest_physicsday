"""Participant state: current station assignment, completion, and the payload sent to clients."""

import random
from collections import Counter, defaultdict
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
    """Stations the participant must pass, in display order."""
    if participant.kind == Participant.PAPER:
        return [s.id for s in snap.stations]
    route = set(participant.route)
    return [s.id for s in snap.stations if s.id in route]


def is_all_done(participant: Participant, visited: set[int], snap: StationSnapshot) -> bool:
    return all(sid in visited for sid in required_station_ids(participant, snap))


def visits_by_participant(participant_ids) -> dict[int, dict[int, "Visit"]]:
    result: dict[int, dict[int, Visit]] = defaultdict(dict)
    for visit in Visit.objects.filter(participant_id__in=list(participant_ids)):
        result[visit.participant_id][visit.station_id] = visit
    return result


def current_load() -> Counter:
    """Number of participants currently sent to each station."""
    rows = (
        Participant.objects.filter(prize_at__isnull=True)
        .exclude(current_station=None)
        .values_list("current_station_id", flat=True)
    )
    return Counter(rows)


def least_loaded(station_ids: list[int], load: Counter, rng: random.Random | None = None) -> int:
    """The station with the fewest participants sent to it (random among ties)."""
    min_load = min(load.get(sid, 0) for sid in station_ids)
    return (rng or random).choice([sid for sid in station_ids if load.get(sid, 0) == min_load])


def recompute_current(
    participants, snap: StationSnapshot | None = None, assign_paper: bool = False
) -> list[Participant]:
    """Keep each participant's current station while it is still pending, otherwise send them on.

    The next station is not known in advance: it is the least loaded pending one at the moment
    the previous one is passed. Paper participants have no route and walk to any station; they
    get one only on request (`assign_paper`, the help screen). All passed — the finish; prize — none.
    Returns the participants whose current station changed (saved).
    """
    participants = list(participants)
    if not participants:
        return []
    snap = snap or StationSnapshot.load()
    visits = visits_by_participant(p.id for p in participants)
    load = current_load()
    changed = []
    for p in participants:
        pending = [sid for sid in required_station_ids(p, snap) if sid not in visits[p.id]]
        if p.prize_at:
            new_id = None
        elif not pending:
            new_id = snap.finish.id
        elif p.current_station_id in pending:
            new_id = p.current_station_id
        elif p.kind == Participant.PAPER and not assign_paper:
            new_id = None
        else:
            new_id = least_loaded(pending, load)
        if new_id != p.current_station_id:
            load[p.current_station_id] -= 1
            load[new_id] += 1
            p.current_station_id = new_id
            changed.append(p)
    if changed:
        Participant.objects.bulk_update(changed, ["current_station"])
    return changed


def station_payload(station: Station) -> dict:
    return {
        "id": station.id,
        "name": station.name,
        "number": station.number,
        "description": station.description,
        "floor": station.floor,
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
            "current_station_id": participant.current_station_id,
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
