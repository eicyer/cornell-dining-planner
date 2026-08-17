from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env.local"

DEV_SESSION_SECRET = "dev-only-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_ENV_FILE), extra="ignore")

    # "production" unlocks stricter runtime behavior elsewhere (fail-fast
    # checks below, secure cookies, HSTS) — see docs/adr/0018. Set via
    # ENVIRONMENT env var.
    environment: Literal["development", "production"] = "development"

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5433/cornell_dining"

    google_client_id: str = ""
    google_client_secret: str = ""
    session_secret: str = DEV_SESSION_SECRET
    frontend_url: str = "http://localhost:8081"

    # "lax" assumes frontend and backend share a registrable domain (the
    # default, hardened topology from docs/adr/0018). Set to "none" only for
    # a cross-site deploy (frontend and backend on different domains) — the
    # browser then requires the cookie to also be Secure, which is already
    # tied to ENVIRONMENT=production below.
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    anthropic_api_key: str = ""
    usda_api_key: str = ""

    # Sole account allowed into /admin — see docs/adr/0016-admin-panel-for-nutrition-corrections.
    admin_email: str = "emiricyer07@gmail.com"

    # Comma-separated allowlist consumed by CORSMiddleware and, together with
    # backend_url below, by the CSRF Origin check — see docs/adr/0018.
    cors_allowed_origins: str = "http://localhost:8081,http://localhost:19006,http://localhost:19000"

    # This backend's own canonical origin. The admin panel is deliberately
    # served same-origin (see docs/adr/0016), so its fetches carry this as
    # their Origin header — the CSRF check needs to trust it explicitly.
    backend_url: str = "http://localhost:8001"

    # Comma-separated Host header allowlist for TrustedHostMiddleware.
    allowed_hosts: str = "localhost,127.0.0.1"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

    @property
    def trusted_hosts(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

    @model_validator(mode="after")
    def _refuse_dev_defaults_in_production(self) -> "Settings":
        if self.environment != "production":
            return self
        problems = []
        if self.session_secret == DEV_SESSION_SECRET:
            problems.append("SESSION_SECRET is still the dev placeholder")
        if "postgres:postgres@localhost" in self.database_url:
            problems.append("DATABASE_URL still points at the dev-default local Postgres credentials")
        if not self.google_client_id or not self.google_client_secret:
            problems.append("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are unset")
        if not self.frontend_url.startswith("https://"):
            problems.append("FRONTEND_URL must be an https:// URL in production")
        if problems:
            raise RuntimeError(
                "Refusing to start with ENVIRONMENT=production and insecure config: " + "; ".join(problems)
            )
        return self


settings = Settings()
