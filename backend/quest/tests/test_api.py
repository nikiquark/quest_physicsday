import pytest
from channels.testing import WebsocketCommunicator
from rest_framework.test import APIClient

from config.asgi import application
from quest.models import Participant
from quest.services import auth

pytestmark = pytest.mark.django_db(transaction=True)

ORIGIN = [(b"origin", b"http://localhost")]


def ws(path: str) -> WebsocketCommunicator:
    return WebsocketCommunicator(application, path, headers=ORIGIN)


def staff_client(pin: str) -> APIClient:
    client = APIClient()
    token = client.post("/api/staff/login", {"pin": pin}, format="json").json()["token"]
    client.credentials(HTTP_AUTHORIZATION=f"Staff {token}")
    return client


def test_register_and_me_via_cookie(stations):
    client = APIClient()
    res = client.post("/api/participants/register", {"name": "Петя"}, format="json")
    assert res.status_code == 201
    token = res.json()["token"]
    assert res.cookies["pq_token"].value == token

    # Second registration from the same browser returns the same participant.
    again = client.post("/api/participants/register", {"name": "Другой"}, format="json")
    assert again.json()["token"] == token

    me = client.get("/api/participants/me")
    assert me.json()["state"]["participant"]["name"] == "Петя"
    assert APIClient().get("/api/participants/me").status_code == 401


def test_staff_roles_are_enforced(stations):
    station = staff_client("111111")
    assert station.get("/api/staff/stations").status_code == 200
    assert station.get("/api/admin/stats").status_code == 403
    assert station.get("/api/staff/markers/1").status_code == 403
    admin = staff_client("0987")
    assert admin.get("/api/admin/stats").status_code == 200
    assert admin.get("/api/admin/participants").status_code == 200
    assert station.get("/api/admin/participants").status_code == 403
    assert admin.get("/api/staff/markers/1").status_code == 200


def test_prize_flow(stations):
    client = APIClient()
    marker = client.post("/api/participants/register", {"name": "a"}, format="json").json()["state"]["participant"][
        "marker_id"
    ]
    prize = staff_client("222222")
    res = prize.post(f"/api/staff/markers/{marker}/prize", {}, format="json")
    assert res.status_code == 409 and res.json()["code"] == "not_complete"
    res = prize.post(f"/api/staff/markers/{marker}/prize", {"force": True}, format="json")
    assert res.status_code == 200 and res.json()["participant"]["prize_forced"] is True
    res = prize.post(f"/api/staff/markers/{marker}/prize", {"force": True}, format="json")
    assert res.json()["code"] == "already_granted"
    assert prize.get("/api/staff/markers/998").json()["code"] == "unknown_marker"


def test_admin_reset_requires_pin(stations):
    admin = staff_client("0987")
    assert admin.post("/api/admin/reset", {"pin": "1111"}, format="json").status_code == 403
    assert admin.post("/api/admin/reset", {"pin": "0987"}, format="json").status_code == 200


def test_admin_settings_pins(seeded):
    admin = staff_client("0987")
    res = admin.patch("/api/admin/settings", {"pins": {"prize": "777777"}}, format="json")
    assert res.json()["pins"]["prize"] == "777777"
    res = admin.patch("/api/admin/settings", {"pins": {"prize": "0987"}}, format="json")
    assert res.status_code == 409


async def test_station_scan_pushes_state_to_participant(stations):
    from asgiref.sync import sync_to_async

    from quest.services.participants import register

    kid = await sync_to_async(register)("k")
    _, token = await sync_to_async(auth.login)("111111", "9.9.9.9")
    station_id = kid.route[0]

    phone = ws(f"/ws/participant/?token={kid.token}")
    assert (await phone.connect())[0]
    first = await phone.receive_json_from()
    assert first["type"] == "state"

    scanner = ws(f"/ws/station/{station_id}/?token={token}")
    assert (await scanner.connect())[0]
    assert (await scanner.receive_json_from())["type"] == "hello"
    await scanner.send_json_to({"type": "scan", "batch": "b1", "ids": [kid.marker_id, 998]})
    result = await scanner.receive_json_from(timeout=5)
    assert result == {
        "type": "scan_result",
        "batch": "b1",
        "results": [{"id": kid.marker_id, "status": "accepted"}, {"id": 998, "status": "unknown"}],
    }

    pushed = await phone.receive_json_from(timeout=5)
    visited = [s for s in pushed["state"]["stations"] if s["visited"]]
    assert [s["id"] for s in visited] == [station_id]

    await scanner.disconnect()
    await phone.disconnect()


async def test_invalid_tokens_get_close_code(seeded):
    phone = ws("/ws/participant/?token=nope")
    await phone.connect()
    assert (await phone.receive_json_from())["type"] == "invalid"
    assert (await phone.receive_output())["code"] == 4001

    scanner = ws("/ws/station/1/?token=nope")
    await scanner.connect()
    assert (await scanner.receive_json_from())["type"] == "invalid"


async def test_admin_ws_receives_stats(seeded):
    from asgiref.sync import sync_to_async

    _, token = await sync_to_async(auth.login)("0987", "8.8.8.8")
    admin = ws(f"/ws/admin/?token={token}")
    assert (await admin.connect())[0]
    message = await admin.receive_json_from()
    assert message["type"] == "stats"
    assert message["stats"]["participants"]["phone_total"] == 0
    await admin.disconnect()


def test_paper_participant_count(seeded):
    assert Participant.objects.filter(kind="paper").count() == 250
