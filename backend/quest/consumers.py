import asyncio
import logging
import time
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from quest.models import Participant, StaffPin, Station
from quest.services import broadcast
from quest.services.auth import role_from_token
from quest.services.participants import by_token
from quest.services.scans import process_scan
from quest.services.state import state_for
from quest.services.stats import dashboard_stats

log = logging.getLogger(__name__)

# Close code the client treats as "credentials are no longer valid, do not reconnect".
CLOSE_INVALID = 4001
STATS_MIN_INTERVAL = 1.0


class BaseConsumer(AsyncJsonWebsocketConsumer):
    groups_joined: list[str]

    def query_param(self, name: str) -> str | None:
        values = parse_qs(self.scope.get("query_string", b"").decode()).get(name)
        return values[0] if values else None

    async def join(self, *groups: str) -> None:
        self.groups_joined = list(groups)
        for group in groups:
            await self.channel_layer.group_add(group, self.channel_name)

    async def reject(self, reason: str) -> None:
        # Accept first so the browser sees our close code instead of a generic handshake failure.
        await self.accept()
        await self.send_json({"type": "invalid", "reason": reason})
        await self.close(code=CLOSE_INVALID)

    async def disconnect(self, code):
        for group in getattr(self, "groups_joined", []):
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})
        else:
            await self.handle(content)

    async def handle(self, content: dict) -> None:
        pass


class ParticipantConsumer(BaseConsumer):
    async def connect(self):
        participant = await database_sync_to_async(by_token)(self.query_param("token"))
        if participant is None:
            await self.reject("unknown_participant")
            return
        self.participant_id = participant.id
        await self.join(broadcast.participant_group(participant.id), broadcast.PARTICIPANTS_GROUP)
        await self.accept()
        await self.send_json({"type": "state", "state": await database_sync_to_async(state_for)(participant)})

    @database_sync_to_async
    def _load_state(self):
        participant = Participant.objects.filter(pk=self.participant_id).first()
        return state_for(participant) if participant else None

    async def state_push(self, event):
        await self.send_json({"type": "state", "state": event["state"]})

    async def state_refresh(self, event):
        state = await self._load_state()
        if state is None:
            await self.reject("unknown_participant")
        else:
            await self.send_json({"type": "state", "state": state})

    async def station_patch(self, event):
        await self.send_json({"type": "station_patch", "station": event["station"]})

    async def quest_reset(self, event):
        await self.send_json({"type": "reset"})
        await self.close(code=CLOSE_INVALID)


class StationConsumer(BaseConsumer):
    @database_sync_to_async
    def _authorize(self, token, station_id):
        role = role_from_token(token)
        if role not in (StaffPin.STATION, StaffPin.ADMIN):
            return None
        return Station.objects.filter(pk=station_id, enabled=True, is_finish=False).first()

    async def connect(self):
        self.station_id = int(self.scope["url_route"]["kwargs"]["station_id"])
        station = await self._authorize(self.query_param("token"), self.station_id)
        if station is None:
            await self.reject("forbidden")
            return
        self.groups_joined = []
        await self.accept()
        await self.send_json({"type": "hello", "station": {"id": station.id, "name": station.name}})

    @database_sync_to_async
    def _scan(self, ids):
        results, changed = process_scan(self.station_id, ids)
        if changed:
            broadcast.push_states(changed)
        return results

    async def handle(self, content):
        if content.get("type") != "scan":
            return
        ids = content.get("ids") or []
        if not isinstance(ids, list):
            return
        started = time.monotonic()
        results = await self._scan(ids[:100])
        log.info("station %s scan %d ids in %.0f ms", self.station_id, len(ids), (time.monotonic() - started) * 1000)
        await self.send_json({"type": "scan_result", "batch": content.get("batch"), "results": results})


class AdminConsumer(BaseConsumer):
    async def connect(self):
        role = await database_sync_to_async(role_from_token)(self.query_param("token"))
        if role != StaffPin.ADMIN:
            await self.reject("forbidden")
            return
        self.last_sent = 0.0
        self.pending: asyncio.Task | None = None
        await self.join(broadcast.ADMIN_GROUP)
        await self.accept()
        await self.send_stats()

    async def send_stats(self):
        self.last_sent = time.monotonic()
        stats = await database_sync_to_async(dashboard_stats)()
        await self.send_json({"type": "stats", "stats": stats})

    async def stats_dirty(self, event):
        if self.pending and not self.pending.done():
            return
        wait = STATS_MIN_INTERVAL - (time.monotonic() - self.last_sent)
        if wait <= 0:
            await self.send_stats()
            return

        async def delayed():
            await asyncio.sleep(wait)
            await self.send_stats()

        self.pending = asyncio.create_task(delayed())

    async def disconnect(self, code):
        if getattr(self, "pending", None):
            self.pending.cancel()
        await super().disconnect(code)
