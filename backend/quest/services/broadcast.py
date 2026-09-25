"""Push updates to WebSocket groups. Call from sync code (views, services run via sync_to_async)."""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from quest.services.state import states_for

ADMIN_GROUP = "admin"
PARTICIPANTS_GROUP = "participants"


def participant_group(participant_id: int) -> str:
    return f"participant_{participant_id}"


def _send(group: str, message: dict) -> None:
    layer = get_channel_layer()
    if layer is not None:
        async_to_sync(layer.group_send)(group, message)


def push_states(participants) -> None:
    """Send fresh state to each participant's devices and mark admin stats dirty."""
    for pid, state in states_for(participants).items():
        _send(participant_group(pid), {"type": "state.push", "state": state})
    admin_dirty()


def admin_dirty() -> None:
    _send(ADMIN_GROUP, {"type": "stats.dirty"})


def refresh_all_participants() -> None:
    """Station list changed: every participant consumer re-reads its own state."""
    _send(PARTICIPANTS_GROUP, {"type": "state.refresh"})
    admin_dirty()


def reset_all_participants() -> None:
    _send(PARTICIPANTS_GROUP, {"type": "quest.reset"})
    admin_dirty()


def patch_station(station_payload: dict) -> None:
    """Cosmetic station change (name, position): clients patch it in place without a DB round trip."""
    _send(PARTICIPANTS_GROUP, {"type": "station.patch", "station": station_payload})
    admin_dirty()
