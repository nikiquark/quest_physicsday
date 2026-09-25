from django.contrib import admin

from quest.models import EventLog, Participant, Settings, StaffPin, Station, Visit


@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = ("number", "name", "enabled", "is_finish", "x", "y")


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ("marker_id", "kind", "name", "current_station", "activated_at", "prize_at", "prize_forced")
    list_filter = ("kind", "prize_forced")
    search_fields = ("name", "marker_id")


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ("participant", "station", "source", "created_at")
    list_filter = ("station", "source")


@admin.register(EventLog)
class EventLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "participant", "station")
    list_filter = ("kind",)


admin.site.register(Settings)
admin.site.register(StaffPin)
