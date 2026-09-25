from django.urls import path

from quest.api import views

urlpatterns = [
    path("public/status", views.PublicStatusView.as_view()),
    path("participants/register", views.RegisterView.as_view()),
    path("participants/me", views.MeView.as_view()),
    path("staff/login", views.LoginView.as_view()),
    path("staff/me", views.StaffMeView.as_view()),
    path("staff/stations", views.StationListView.as_view()),
    path("staff/markers/<int:marker_id>", views.MarkerView.as_view()),
    path("staff/markers/<int:marker_id>/prize", views.PrizeView.as_view()),
    path("admin/stats", views.StatsView.as_view()),
    path("admin/stations", views.AdminStationsView.as_view()),
    path("admin/stations/<int:station_id>", views.AdminStationView.as_view()),
    path("admin/participants", views.AdminParticipantsView.as_view()),
    path("admin/participants/<int:marker_id>", views.AdminParticipantView.as_view()),
    path("admin/participants/<int:marker_id>/visits", views.AdminVisitsView.as_view()),
    path("admin/participants/<int:marker_id>/visits/<int:station_id>", views.AdminVisitView.as_view()),
    path("admin/settings", views.AdminSettingsView.as_view()),
    path("admin/reset", views.AdminResetView.as_view()),
]
