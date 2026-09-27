"""One map per floor instead of both floors on one picture (viewBox 1000x1020 -> 1000x550 per floor).

Stations get a `floor` field; y becomes a fraction of a single floor plan. Both floors used to
start at y=40 / y=580 of the shared picture, now every floor starts at y=40 of its own plan.
"""

from django.db import migrations, models

OLD_HEIGHT = 1020
NEW_HEIGHT = 550
OLD_SPLIT = 550  # between the "Вход" label and the second floor
SECOND_FLOOR_SHIFT = 540  # second floor top: 580 -> 40


def forward(apps, schema_editor):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        py = station.y * OLD_HEIGHT
        if py < OLD_SPLIT:
            station.floor = 1
        else:
            station.floor = 2
            py -= SECOND_FLOOR_SHIFT
        station.y = min(1.0, max(0.0, py / NEW_HEIGHT))
        station.save(update_fields=["floor", "y"])


def backward(apps, schema_editor):
    Station = apps.get_model("quest", "Station")
    for station in Station.objects.all():
        py = station.y * NEW_HEIGHT
        if station.floor > 1:  # the third floor has no place on the old map, put it on the second
            py += SECOND_FLOOR_SHIFT
        station.y = min(1.0, max(0.0, py / OLD_HEIGHT))
        station.save(update_fields=["y"])


class Migration(migrations.Migration):
    dependencies = [("quest", "0004_shorter_floor_legs")]

    operations = [
        migrations.AddField(
            model_name="station",
            name="floor",
            field=models.PositiveSmallIntegerField(
                choices=[(1, "1 этаж"), (2, "2 этаж"), (3, "3 этаж")], default=1
            ),
        ),
        migrations.AlterField(model_name="station", name="y", field=models.FloatField(default=0.545)),
        migrations.RunPython(forward, backward),
    ]
