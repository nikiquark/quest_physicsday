"""Shorter "П" legs and floors closer together (viewBox 1000x1400 -> 1000x1020).

Each floor's opening shrank from 320 to 160 px (legs halved, crossbar kept 200 px);
the first floor moved from y=80 to y=40, the second from y=820 to y=580.
Stations keep their spot on their floor: y inside the legs is halved, below them shifted up.
"""

from django.db import migrations, models

OLD_HEIGHT = 1400
NEW_HEIGHT = 1020
OLD_LEGS = 320
NEW_LEGS = 160
# (old floor top, new floor top), first floor then second
FLOORS = [(80, 40), (820, 580)]
OLD_SPLIT = 760  # between the "Вход" label and the second floor
NEW_SPLIT = 550


def _squeeze(local):
    if local <= 0:
        return local
    if local <= OLD_LEGS:
        return local * NEW_LEGS / OLD_LEGS
    return local - (OLD_LEGS - NEW_LEGS)


def _stretch(local):
    if local <= 0:
        return local
    if local <= NEW_LEGS:
        return local * OLD_LEGS / NEW_LEGS
    return local + (OLD_LEGS - NEW_LEGS)


def forward(apps, schema_editor):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        py = station.y * OLD_HEIGHT
        old_top, new_top = FLOORS[0] if py < OLD_SPLIT else FLOORS[1]
        station.y = min(1.0, max(0.0, (new_top + _squeeze(py - old_top)) / NEW_HEIGHT))
        station.save(update_fields=["y"])


def backward(apps, schema_editor):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        py = station.y * NEW_HEIGHT
        old_top, new_top = FLOORS[0] if py < NEW_SPLIT else FLOORS[1]
        station.y = min(1.0, max(0.0, (old_top + _stretch(py - new_top)) / OLD_HEIGHT))
        station.save(update_fields=["y"])


class Migration(migrations.Migration):
    dependencies = [("quest", "0003_swap_floors")]

    operations = [
        migrations.AlterField(model_name="station", name="y", field=models.FloatField(default=0.294)),
        migrations.RunPython(forward, backward),
    ]
