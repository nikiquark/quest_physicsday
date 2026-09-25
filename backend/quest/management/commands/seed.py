from django.core.management.base import BaseCommand

from quest.services.seed import ensure_seed


class Command(BaseCommand):
    help = "Create the finish station, default PINs and paper participants (idempotent)."

    def handle(self, *args, **options):
        ensure_seed()
        self.stdout.write("Seed ok")
