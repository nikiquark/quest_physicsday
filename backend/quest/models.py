from django.contrib.postgres.fields import ArrayField
from django.db import models

PAPER_MARKERS = range(0, 250)
PHONE_MARKERS = range(250, 1000)


class Station(models.Model):
    name = models.CharField(max_length=100)
    number = models.PositiveIntegerField(default=0)
    description = models.CharField(max_length=300, blank=True)
    x = models.FloatField(default=0.5)
    y = models.FloatField(default=0.294)  # centre of the first floor on the map
    enabled = models.BooleanField(default=True)
    is_finish = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["is_finish", "number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_finish"],
                condition=models.Q(is_finish=True),
                name="single_finish_station",
            )
        ]

    def __str__(self):
        return f"{self.number}. {self.name}"


class Participant(models.Model):
    PHONE = "phone"
    PAPER = "paper"
    KIND_CHOICES = [(PHONE, "Телефон"), (PAPER, "Бумага")]

    kind = models.CharField(max_length=5, choices=KIND_CHOICES)
    marker_id = models.PositiveIntegerField(unique=True)
    name = models.CharField(max_length=50, blank=True)
    token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    route = ArrayField(models.IntegerField(), default=list, blank=True)
    current_station = models.ForeignKey(
        Station, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    activated_at = models.DateTimeField(null=True, blank=True)
    prize_at = models.DateTimeField(null=True, blank=True)
    prize_forced = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["marker_id"]

    def __str__(self):
        return f"#{self.marker_id} {self.name or self.get_kind_display()}"

    @property
    def display_name(self) -> str:
        return self.name or f"Бумажный №{self.marker_id}"


class Visit(models.Model):
    SCAN = "scan"
    MANUAL = "manual"

    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name="visits")
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name="visits")
    source = models.CharField(max_length=6, default=SCAN)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["participant", "station"], name="unique_visit"),
        ]


class EventLog(models.Model):
    PRIZE = "prize"
    PRIZE_FORCED = "prize_forced"
    VISIT_ADDED = "visit_added"
    VISIT_REMOVED = "visit_removed"
    RESET = "reset"

    kind = models.CharField(max_length=20)
    participant = models.ForeignKey(
        Participant, null=True, blank=True, on_delete=models.CASCADE, related_name="events"
    )
    station = models.ForeignKey(Station, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Settings(models.Model):
    """Singleton row (pk=1). Its row lock also serializes registrations."""

    registration_open = models.BooleanField(default=True)

    @classmethod
    def load(cls) -> "Settings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class StaffPin(models.Model):
    ADMIN = "admin"
    STATION = "station"
    PRIZE = "prize"
    HELP = "help"
    ROLES = [ADMIN, STATION, PRIZE, HELP]
    DEFAULTS = {ADMIN: "0987", STATION: "111111", PRIZE: "222222", HELP: "333333"}

    role = models.CharField(max_length=10, primary_key=True)
    pin = models.CharField(max_length=8)
    version = models.PositiveIntegerField(default=1)
