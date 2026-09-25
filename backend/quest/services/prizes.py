from django.db import transaction
from django.utils import timezone

from quest.models import EventLog, Participant
from quest.services.participants import QuestError
from quest.services.state import StationSnapshot, is_all_done, recompute_current, visits_by_participant


class NotComplete(QuestError):
    code = "not_complete"


class AlreadyGranted(QuestError):
    code = "already_granted"


def grant_prize(participant: Participant, force: bool = False) -> Participant:
    with transaction.atomic():
        participant = Participant.objects.select_for_update().get(pk=participant.pk)
        if participant.prize_at:
            raise AlreadyGranted()
        snap = StationSnapshot.load()
        visited = set(visits_by_participant([participant.id])[participant.id])
        complete = is_all_done(participant, visited, snap)
        if not complete and not force:
            raise NotComplete()
        participant.prize_at = timezone.now()
        participant.prize_forced = not complete
        if participant.activated_at is None:
            participant.activated_at = participant.prize_at
        participant.save(update_fields=["prize_at", "prize_forced", "activated_at"])
        EventLog.objects.create(
            kind=EventLog.PRIZE_FORCED if participant.prize_forced else EventLog.PRIZE,
            participant=participant,
        )
        recompute_current([participant], snap)
    return participant
