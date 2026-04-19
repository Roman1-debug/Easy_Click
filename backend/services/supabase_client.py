# Supabase removed — stub so existing imports don't break at module load
def get_supabase():
    raise RuntimeError("Supabase removed. Use SQLite via database.get_db() instead.")
