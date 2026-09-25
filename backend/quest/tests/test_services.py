import random
from collections import Counter

import pytest

from quest.models import EventLog, Participant, Settings, StaffPin, Station, Visit
from quest.services import auth
from quest.services.participants import (
    NoMarkersLeft,
    QuestError,
    RegistrationClosed,
    add_visit_manual,
    register,
    remove_visit_manual,
)
from quest.services.prizes import AlreadyGranted, NotComplete, grant_prize
from quest.services.routes import generate_route, insert_into_route
from quest.services.scans import process_scan
from quest.services.seed import reset_quest
from quest.services.state import state_for
from quest.services.stations import create_station, update_station
from quest.services.stats import active_phone_participants, dashboard_stats

pytestmark = pytest.mark.django_db


def statuses(results):
    return {r["id"]: r["status"] for r in results}


# --- seed ----------------------------------------------------------------------------


def test_seed_creates_finish_pins_and_paper_markers(seeded):
    assert Station.objects.filter(is_finish=True).count() == 1
    assert Participant.objects.filter(kind=Participant.PAPER).count() == 250
    assert {p.role: p.pin for p in StaffPin.objects.all()} == StaffPin.DEFAULTS


# --- routes ------------------------------------------------------------------------------


def test_generate_route_starts_at_least_loaded_station():
    route = generate_route([1, 2, 3], Counter({1: 5, 2: 0, 3: 2}), random.Random(1))
    assert route[0] == 2
    assert sorted(route) == [1, 2, 3]


def test_generate_route_breaks_ties_randomly():
    firsts = {generate_route([1, 2, 3], Counter(), random.Random(seed))[0] for seed in range(50)}
    assert firsts == {1, 2, 3}


def test_insert_into_route_only_among_pending():
    for seed in range(30):
        route = insert_into_route([1, 2, 3], 9, visited={1, 2}, rng=random.Random(seed))
        assert route.index(9) >= 2


def test_registration_spreads_first_stations(stations):
    firsts = Counter(register(f"kid{i}").route[0] for i in range(8))
    assert set(firsts.values()) == {2}  # 8 kids over 4 empty stations: 2 each


def test_registration_assigns_sequential_phone_markers(stations):
    assert [register("a").marker_id, register("b").marker_id] == [250, 251]


def test_registration_closed(stations):
    Settings.objects.filter(pk=1).update(registration_open=False)
    with pytest.raises(RegistrationClosed):
        register("a")


def test_registration_out_of_markers(stations):
    Participant.objects.create(kind=Participant.PHONE, marker_id=999, name="last", token="t")
    with pytest.raises(NoMarkersLeft):
        register("a")


def test_registration_rejects_empty_name(stations):
    with pytest.raises(QuestError):
        register("   ")


# --- scanning ------------------------------------------------------------------------------


def test_scan_is_bulk_and_idempotent(stations):
    kids = [register(f"k{i}") for i in range(3)]
    ids = [k.marker_id for k in kids]
    results, changed = process_scan(stations[0].id, ids + [5, 998])
    assert statuses(results) == {250: "accepted", 251: "accepted", 252: "accepted", 5: "accepted", 998: "unknown"}
    assert len(changed) == 4

    results, changed = process_scan(stations[0].id, ids)
    assert set(statuses(results).values()) == {"already"}
    assert changed == []
    assert Visit.objects.count() == 4


def test_scan_ignores_garbage_ids(stations):
    results, _ = process_scan(stations[0].id, ["x", -1, 1000, True, 3, 3])
    assert statuses(results) == {3: "accepted"}


def test_scan_on_disabled_station(stations):
    stations[0].enabled = False
    stations[0].save()
    results, changed = process_scan(stations[0].id, [1])
    assert statuses(results) == {1: "disabled"}
    assert changed == []


def test_scan_out_of_order_counts_and_moves_current(stations):
    kid = register("k")
    first, second = kid.route[0], kid.route[1]
    process_scan(second, [kid.marker_id])
    kid.refresh_from_db()
    assert kid.current_station_id == first
    process_scan(first, [kid.marker_id])
    kid.refresh_from_db()
    assert kid.current_station_id == kid.route[2]


def test_paper_marker_activates_on_first_scan(stations):
    paper = Participant.objects.get(marker_id=7)
    assert paper.activated_at is None
    process_scan(stations[0].id, [7])
    paper.refresh_from_db()
    assert paper.activated_at is not None
    assert paper.current_station_id is None  # paper has no route


def test_all_done_moves_to_finish(stations, finish):
    kid = register("k")
    for s in stations:
        process_scan(s.id, [kid.marker_id])
    kid.refresh_from_db()
    assert kid.current_station_id == finish.id
    state = state_for(kid)
    assert state["participant"]["all_done"] is True
    assert state["stations"][-1]["is_finish"] is True


# --- stations ------------------------------------------------------------------------------


def test_new_station_inserted_for_walking_participants_only(stations):
    walking = register("walking")
    done = register("done")
    for s in stations:
        process_scan(s.id, [done.marker_id])
    process_scan(walking.route[0], [walking.marker_id])

    new = create_station({"name": "Новая", "number": 9})
    walking.refresh_from_db()
    done.refresh_from_db()
    assert new.id in walking.route
    assert walking.route.index(new.id) >= 1  # never before already passed stations
    assert new.id not in done.route
    assert state_for(done)["participant"]["all_done"] is True


def test_disable_station_removes_it_from_requirements(stations, finish):
    kid = register("k")
    for sid in kid.route[:-1]:
        process_scan(sid, [kid.marker_id])
    last = Station.objects.get(pk=kid.route[-1])
    update_station(last, {"enabled": False})
    kid.refresh_from_db()
    assert kid.current_station_id == finish.id
    assert state_for(kid)["participant"]["all_done"] is True


def test_reenabled_station_added_to_later_registrations(stations):
    update_station(stations[0], {"enabled": False})
    kid = register("k")
    assert stations[0].id not in kid.route
    update_station(stations[0], {"enabled": True})
    kid.refresh_from_db()
    assert stations[0].id in kid.route


def test_finish_cannot_be_disabled(finish):
    update_station(finish, {"enabled": False, "x": 2})
    finish.refresh_from_db()
    assert finish.enabled is True
    assert finish.x == 1.0


# --- prizes ------------------------------------------------------------------------------------


def test_prize_requires_completion_unless_forced(stations):
    kid = register("k")
    with pytest.raises(NotComplete):
        grant_prize(kid)
    grant_prize(kid, force=True)
    kid.refresh_from_db()
    assert kid.prize_at and kid.prize_forced
    assert EventLog.objects.filter(kind=EventLog.PRIZE_FORCED, participant=kid).exists()
    with pytest.raises(AlreadyGranted):
        grant_prize(kid, force=True)


def test_prize_after_completion(stations):
    kid = register("k")
    for s in stations:
        process_scan(s.id, [kid.marker_id])
    grant_prize(kid)
    kid.refresh_from_db()
    assert kid.prize_at and not kid.prize_forced
    assert kid.current_station_id is None


# --- manual marks, stats, reset --------------------------------------------------------------------


def test_manual_visit_add_and_remove(stations):
    kid = register("k")
    add_visit_manual(kid, stations[0])
    add_visit_manual(kid, stations[0])
    assert Visit.objects.filter(participant=kid).count() == 1
    remove_visit_manual(kid, stations[0])
    assert Visit.objects.filter(participant=kid).count() == 0
    assert EventLog.objects.filter(participant=kid).count() == 2


def test_dashboard_stats(stations):
    kids = [register(f"k{i}") for i in range(3)]
    for s in stations:
        process_scan(s.id, [kids[0].marker_id, 3])
    grant_prize(kids[1], force=True)
    stats = dashboard_stats()
    assert stats["participants"] == {
        "phone_total": 3,
        "paper_activated": 1,
        "all_done": 2,
        "at_finish": 2,
        "prize_total": 1,
        "prize_forced": 1,
    }
    assert sum(s["active"] for s in stats["stations"] if not s["is_finish"]) == 1


def test_reset_keeps_stations_and_pins(stations):
    kid = register("k")
    process_scan(stations[0].id, [kid.marker_id, 1])
    auth.set_pins({"station": "123456"})
    reset_quest()
    assert Participant.objects.filter(kind=Participant.PHONE).count() == 0
    assert Participant.objects.filter(kind=Participant.PAPER, activated_at__isnull=False).count() == 0
    assert Visit.objects.count() == 0
    assert Station.objects.count() == 5
    assert StaffPin.objects.get(role="station").pin == "123456"


# --- auth ------------------------------------------------------------------------------------------


def test_login_routes_by_pin(seeded):
    role, token = auth.login("0987", "1.1.1.1")
    assert role == "admin"
    assert auth.role_from_token(token) == "admin"
    with pytest.raises(auth.InvalidPin):
        auth.login("000000", "1.1.1.1")


def test_pin_change_invalidates_tokens(seeded):
    _, token = auth.login("111111", "1.1.1.1")
    auth.set_pins({"station": "444444"})
    assert auth.role_from_token(token) is None
    assert auth.login("444444", "1.1.1.1")[0] == "station"


def test_pins_must_be_unique_and_numeric(seeded):
    with pytest.raises(QuestError):
        auth.set_pins({"station": "0987"})
    with pytest.raises(QuestError):
        auth.set_pins({"station": "12ab"})
    with pytest.raises(QuestError):
        auth.set_pins({"station": "123"})


def test_login_rate_limit(seeded):
    for _ in range(10):
        with pytest.raises(auth.InvalidPin):
            auth.login("555555", "2.2.2.2")
    with pytest.raises(auth.TooManyAttempts):
        auth.login("0987", "2.2.2.2")
    assert auth.login("0987", "3.3.3.3")[0] == "admin"


def test_active_phone_participants(stations, finish):
    kids = [register(f"k{i}") for i in range(3)]
    process_scan(kids[0].route[0], [kids[0].marker_id, 5])  # 5 is paper: not listed
    grant_prize(kids[1], force=True)  # got the prize: not active any more
    for s in stations:
        process_scan(s.id, [kids[2].marker_id])

    rows = {r["marker_id"]: r for r in active_phone_participants()}
    assert set(rows) == {kids[0].marker_id, kids[2].marker_id}
    first = rows[kids[0].marker_id]
    assert (first["name"], first["passed"], first["total"]) == ("k0", 1, 4)
    assert first["current_station"] == Station.objects.get(pk=kids[0].route[1]).name
    assert rows[kids[2].marker_id]["at_finish"] is True
    assert rows[kids[2].marker_id]["current_station"] == finish.name
