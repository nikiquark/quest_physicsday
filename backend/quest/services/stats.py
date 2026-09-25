from django.db.models import Count, Q

from quest.models import Participant, Settings, Station


def dashboard_stats() -> dict:
    p = Participant.objects.aggregate(
        phone_total=Count("id", filter=Q(kind=Participant.PHONE)),
        paper_activated=Count("id", filter=Q(kind=Participant.PAPER, activated_at__isnull=False)),
        at_finish=Count(
            "id",
            filter=Q(prize_at__isnull=True, activated_at__isnull=False, current_station__is_finish=True),
        ),
        prize_total=Count("id", filter=Q(prize_at__isnull=False)),
        prize_forced=Count("id", filter=Q(prize_forced=True)),
    )
    stations = Station.objects.annotate(visited_total=Count("visits"))
    active = dict(
        Participant.objects.filter(prize_at__isnull=True, activated_at__isnull=False)
        .exclude(current_station=None)
        .values_list("current_station_id")
        .annotate(n=Count("id"))
    )
    return {
        "registration_open": Settings.load().registration_open,
        "participants": {
            "phone_total": p["phone_total"],
            "paper_activated": p["paper_activated"],
            "all_done": p["at_finish"] + p["prize_total"] - p["prize_forced"],
            "at_finish": p["at_finish"],
            "prize_total": p["prize_total"],
            "prize_forced": p["prize_forced"],
        },
        "stations": [
            {
                "id": s.id,
                "name": s.name,
                "number": s.number,
                "enabled": s.enabled,
                "is_finish": s.is_finish,
                "active": active.get(s.id, 0),
                "visited_total": p["prize_total"] if s.is_finish else s.visited_total,
            }
            for s in stations
        ],
    }
