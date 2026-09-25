import pytest

from quest.models import Station
from quest.services.seed import ensure_seed


@pytest.fixture(autouse=True)
def _test_settings(settings):
    settings.CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
    from django.core.cache import cache

    cache.clear()


@pytest.fixture
def seeded(db):
    ensure_seed()


@pytest.fixture
def stations(seeded):
    return [Station.objects.create(name=f"Станция {i}", number=i) for i in range(1, 5)]


@pytest.fixture
def finish(seeded):
    return Station.objects.get(is_finish=True)
