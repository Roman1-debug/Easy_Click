from supabase import create_client, Client
import os

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if not _client:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client
