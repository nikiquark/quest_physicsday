"""Swap the floors on the map: first floor now on top (y 80..636), second below (y 820..1376).

Before: second floor at y 80..636, first floor at y 740..1296 (viewBox height 1400).
Stations keep their spot on their floor.
"""

from django.db import migrations

HEIGHT = 1400


def _move(apps, split, above_shift, below_shift):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        py = station.y * HEIGHT
        py += above_shift if py < split else below_shift
        station.y = min(1.0, max(0.0, py / HEIGHT))
        station.save(update_fields=["y"])


def forward(apps, schema_editor):
    # old second floor (top) moves down by 740, old first floor (bottom) moves up by 660
    _move(apps, split=700, above_shift=740, below_shift=-660)


def backward(apps, schema_editor):
    _move(apps, split=760, above_shift=660, below_shift=-740)


class Migration(migrations.Migration):
    dependencies = [("quest", "0002_two_floor_map")]

    operations = [migrations.RunPython(forward, backward)]
