from django.db import transaction

from quest.models import PAPER_MARKERS, EventLog, Participant, Settings, StaffPin, Station, Visit

FINISH_NAME = "Финиш — выдача призов"


def ensure_seed() -> None:
    """Idempotent: finish station, settings row, default PINs, paper participants."""
    with transaction.atomic():
        if not Station.objects.filter(is_finish=True).exists():
            Station.objects.create(name=FINISH_NAME, number=0, x=0.5, y=0.887, is_finish=True)
        Settings.load()
        for role, pin in StaffPin.DEFAULTS.items():
            StaffPin.objects.get_or_create(role=role, defaults={"pin": pin})
        Participant.objects.bulk_create(
            [Participant(kind=Participant.PAPER, marker_id=i) for i in PAPER_MARKERS],
            ignore_conflicts=True,
        )


def reset_quest() -> None:
    """Wipe participants' progress. Stations, map positions and PINs are kept."""
    with transaction.atomic():
        Visit.objects.all().delete()
        EventLog.objects.all().delete()
        Participant.objects.filter(kind=Participant.PHONE).delete()
        Participant.objects.filter(kind=Participant.PAPER).update(
            activated_at=None, prize_at=None, prize_forced=False, current_station=None
        )
        EventLog.objects.create(kind=EventLog.RESET)
    ensure_seed()
