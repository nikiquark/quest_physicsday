"""Load test: N participants with live websockets, S stations scanning groups of G markers.

Usage (against a running stack; resets quest data first!):
    python loadtest/run.py --base http://localhost:8000 --participants 500 --stations 10 --group 15

Measures registration latency, scan round-trip (station -> server -> station) and
push latency (station scan -> participant's phone receives the new state).
"""

import argparse
import asyncio
import json
import random
import statistics
import time
import uuid

import httpx
import websockets


def pct(values, p):
    if not values:
        return float("nan")
    values = sorted(values)
    return values[min(len(values) - 1, int(len(values) * p / 100))]


def report(name, values):
    ms = [v * 1000 for v in values]
    print(
        f"{name:<28} n={len(ms):<6} p50={pct(ms, 50):7.1f}ms  p95={pct(ms, 95):7.1f}ms  "
        f"max={max(ms, default=float('nan')):7.1f}ms"
    )


class Phone:
    def __init__(self, marker, token):
        self.marker = marker
        self.token = token
        self.visited: set[int] = set()
        self.waiters: dict[int, float] = {}  # station_id -> scan sent at
        self.push_latency: list[float] = []

    async def run(self, ws_base, ready: asyncio.Event, stop: asyncio.Event):
        async with websockets.connect(f"{ws_base}/ws/participant/?token={self.token}", origin="http://localhost") as ws:
            ready.set()
            while not stop.is_set():
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                msg = json.loads(raw)
                if msg["type"] != "state":
                    continue
                now = time.perf_counter()
                visited = {s["id"] for s in msg["state"]["stations"] if s["visited"] and not s["is_finish"]}
                for sid in visited - self.visited:
                    sent = self.waiters.pop(sid, None)
                    if sent is not None:
                        self.push_latency.append(now - sent)
                self.visited = visited


async def main(args):
    base = args.base.rstrip("/")
    ws_base = base.replace("http", "ws", 1)
    async with httpx.AsyncClient(base_url=f"{base}/api/", timeout=30) as http:
        admin = (await http.post("staff/login", json={"pin": args.admin_pin})).json()["token"]
        auth = {"Authorization": f"Staff {admin}"}
        (await http.post("admin/reset", json={"pin": args.admin_pin}, headers=auth)).raise_for_status()
        stations = [s for s in (await http.get("staff/stations", headers=auth)).json() if not s["is_finish"] and s["enabled"]]
        for i in range(len(stations), args.stations):
            r = await http.post("admin/stations", json={"name": f"LT {i + 1}", "number": i + 1}, headers=auth)
            stations.append(r.json())
        stations = stations[: args.stations]
        station_ids = [s["id"] for s in stations]
        station_token = (await http.post("staff/login", json={"pin": args.station_pin})).json()["token"]

        # --- registration burst ---
        reg_latency = []
        sem = asyncio.Semaphore(args.concurrency)

        async def register(i):
            async with sem:
                t = time.perf_counter()
                # Fresh client per participant: a shared cookie jar would make the server
                # return the same participant again.
                async with httpx.AsyncClient(base_url=f"{base}/api/", timeout=30) as client:
                    r = await client.post("participants/register", json={"name": f"Участник {i}"})
                reg_latency.append(time.perf_counter() - t)
                data = r.json()
                return Phone(data["state"]["participant"]["marker_id"], data["token"])

        t0 = time.perf_counter()
        phones = await asyncio.gather(*(register(i) for i in range(args.participants)))
        print(f"registered {len(phones)} participants in {time.perf_counter() - t0:.1f}s")

    # --- participant sockets ---
    stop = asyncio.Event()
    readies = [asyncio.Event() for _ in phones]
    phone_tasks = [asyncio.create_task(p.run(ws_base, e, stop)) for p, e in zip(phones, readies)]
    await asyncio.wait_for(asyncio.gather(*(e.wait() for e in readies)), timeout=60)
    await asyncio.sleep(1)
    print(f"{len(phones)} participant websockets connected")

    # --- stations scanning groups ---
    scan_latency = []
    errors = 0
    remaining = {sid: list(phones) for sid in station_ids}
    for lst in remaining.values():
        random.shuffle(lst)

    async def station(sid):
        nonlocal errors
        async with websockets.connect(f"{ws_base}/ws/station/{sid}/?token={station_token}", origin="http://localhost") as ws:
            json.loads(await ws.recv())  # hello
            queue = remaining[sid]
            while queue:
                group, queue[:] = queue[: args.group], queue[args.group :]
                batch = str(uuid.uuid4())
                sent = time.perf_counter()
                for p in group:
                    p.waiters[sid] = sent
                await ws.send(json.dumps({"type": "scan", "batch": batch, "ids": [p.marker for p in group]}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("type") == "scan_result" and msg.get("batch") == batch:
                        break
                scan_latency.append(time.perf_counter() - sent)
                errors += sum(1 for r in msg["results"] if r["status"] != "accepted")
                await asyncio.sleep(args.pause)

    t0 = time.perf_counter()
    await asyncio.gather(*(station(sid) for sid in station_ids))
    elapsed = time.perf_counter() - t0
    await asyncio.sleep(2)
    stop.set()
    await asyncio.gather(*phone_tasks, return_exceptions=True)

    pushes = [lat for p in phones for lat in p.push_latency]
    missing = sum(len(p.waiters) for p in phones)
    total = len(phones) * len(station_ids)
    print(f"{total} visits scanned by {len(station_ids)} stations in {elapsed:.1f}s")
    report("registration", reg_latency)
    report("scan round-trip (group)", scan_latency)
    report("push to participant", pushes)
    print(f"not accepted: {errors}, pushes not received: {missing}")
    complete = sum(1 for p in phones if len(p.visited) == len(station_ids))
    print(f"participants with all stations on their phone: {complete}/{len(phones)}")
    return 0 if errors == 0 and missing == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000")
    parser.add_argument("--participants", type=int, default=500)
    parser.add_argument("--stations", type=int, default=10)
    parser.add_argument("--group", type=int, default=15)
    parser.add_argument("--pause", type=float, default=0.2, help="seconds between group scans per station")
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--admin-pin", default="0987")
    parser.add_argument("--station-pin", default="111111")
    raise SystemExit(asyncio.run(main(parser.parse_args())))
