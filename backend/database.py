import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "easyclick.db")


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT,
                phone TEXT,
                skills TEXT,
                target_roles TEXT,
                preferred_location TEXT,
                resume_text TEXT,
                experience_years INTEGER DEFAULT 0,
                linkedin_url TEXT,
                portfolio_url TEXT,
                country TEXT DEFAULT 'India',
                state TEXT,
                pincode TEXT,
                about_me TEXT,
                about_work TEXT,
                about_experience TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT UNIQUE,
                title TEXT,
                company TEXT,
                location TEXT,
                description TEXT,
                apply_link TEXT,
                source TEXT,
                posted_date TEXT,
                score INTEGER DEFAULT 0,
                score_reason TEXT,
                search_query TEXT,
                is_saved INTEGER DEFAULT 0,
                hr_email TEXT,
                salary TEXT,
                experience TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT,
                role TEXT,
                apply_link TEXT,
                status TEXT DEFAULT 'pending',
                job_id INTEGER,
                notes TEXT,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id)
            );

            CREATE TABLE IF NOT EXISTS resume_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER,
                original_text TEXT,
                tailored_yaml TEXT,
                pdf_path TEXT,
                ats_score INTEGER,
                change_summary TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES jobs(id)
            );

            CREATE TABLE IF NOT EXISTS sent_emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                to_addr TEXT,
                cc_addr TEXT,
                subject TEXT,
                body TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'sent'
            );

            CREATE TABLE IF NOT EXISTS interview_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT,
                focus TEXT,
                experience TEXT,
                history TEXT,
                scorecard TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Safe Migrations for users table
        cursor = await db.execute("PRAGMA table_info(users)")
        user_cols = [row[1] for row in await cursor.fetchall()]
        if "experience_years" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN experience_years INTEGER DEFAULT 0")
        if "linkedin_url" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN linkedin_url TEXT")
        if "portfolio_url" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN portfolio_url TEXT")
        if "country" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN country TEXT DEFAULT 'India'")
        if "state" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN state TEXT")
        if "pincode" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN pincode TEXT")
        if "about_me" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN about_me TEXT")
        if "about_work" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN about_work TEXT")
        if "about_experience" not in user_cols:
            await db.execute("ALTER TABLE users ADD COLUMN about_experience TEXT")
        
        # Safe Migrations for jobs table
        cursor = await db.execute("PRAGMA table_info(jobs)")
        job_cols = [row[1] for row in await cursor.fetchall()]
        if "is_saved" not in job_cols:
            await db.execute("ALTER TABLE jobs ADD COLUMN is_saved INTEGER DEFAULT 0")
        if "hr_email" not in job_cols:
            await db.execute("ALTER TABLE jobs ADD COLUMN hr_email TEXT")
        if "salary" not in job_cols:
            await db.execute("ALTER TABLE jobs ADD COLUMN salary TEXT")

        # Safe Migration for interview_sessions table (for existing DBs)
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='interview_sessions'")
        if not await cursor.fetchone():
            await db.execute("""
                CREATE TABLE interview_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT,
                    focus TEXT,
                    experience TEXT,
                    history TEXT,
                    scorecard TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
        await db.commit()