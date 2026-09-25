"""The map became two floors (viewBox 1000x720 -> 1000x1400).

The old single floor is now the first floor, drawn 680 px lower; station y fractions
are recomputed so existing pins stay at the same spot of the first floor.
"""

from django.db import migrations, models

OLD_HEIGHT = 720
NEW_HEIGHT = 1400
FIRST_FLOOR_SHIFT = 680


def to_two_floors(apps, schema_editor):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        station.y = (station.y * OLD_HEIGHT + FIRST_FLOOR_SHIFT) / NEW_HEIGHT
        station.save(update_fields=["y"])


def to_one_floor(apps, schema_editor):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        station.y = min(1.0, max(0.0, (station.y * NEW_HEIGHT - FIRST_FLOOR_SHIFT) / OLD_HEIGHT))
        station.save(update_fields=["y"])


class Migration(migrations.Migration):
    dependencies = [("quest", "0001_initial")]

    operations = [
        migrations.AlterField(model_name="station", name="y", field=models.FloatField(default=0.36)),
        migrations.RunPython(to_two_floors, to_one_floor),
    ]
