from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env.local"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_ENV_FILE), extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5433/cornell_dining"

    google_client_id: str = ""
    google_client_secret: str = ""
    session_secret: str = "dev-only-change-me"
    frontend_url: str = "http://localhost:8081"

    anthropic_api_key: str = ""
    usda_api_key: str = ""

    # Sole account allowed into /admin — see docs/adr/0016-admin-panel-for-nutrition-corrections.
    admin_email: str = "emiricyer07@gmail.com"


settings = Settings()
