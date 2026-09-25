from django.urls import path

from quest import consumers

websocket_urlpatterns = [
    path("ws/participant/", consumers.ParticipantConsumer.as_asgi()),
    path("ws/station/<int:station_id>/", consumers.StationConsumer.as_asgi()),
    path("ws/admin/", consumers.AdminConsumer.as_asgi()),
]
