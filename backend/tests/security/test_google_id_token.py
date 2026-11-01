"""The Google login callback trusts `token["userinfo"]`, which authlib
builds by verifying the ID token's signature and claims (docs/adr/0018).
These pin that verification down against a locally signed token, so an
authlib upgrade that changes the JOSE backend (1.9 moved to joserfc)
can't silently loosen it. No network: server metadata and JWKS are stubbed."""

import asyncio
import time

import pytest
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import RSAKey

from app.routers.auth import oauth

ISSUER = "https://accounts.google.com"
CLIENT_ID = "pytest-client-id"
NONCE = "pytest-nonce"
SIGNING_KEY = RSAKey.generate_key(2048, parameters={"kid": "pytest-key"})
OTHER_KEY = RSAKey.generate_key(2048, parameters={"kid": "pytest-key"})


@pytest.fixture(autouse=True)
def stub_google(monkeypatch):
    async def metadata():
        return {
            "issuer": ISSUER,
            "jwks": {"keys": [SIGNING_KEY.as_dict(private=False)]},
            "id_token_signing_alg_values_supported": ["RS256"],
        }

    monkeypatch.setattr(oauth.google, "load_server_metadata", metadata)
    monkeypatch.setattr(oauth.google, "client_id", CLIENT_ID)


def _id_token(key=SIGNING_KEY, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": CLIENT_ID,
        "sub": "google-sub-123",
        "email": "student@cornell.edu",
        "email_verified": True,
        "iat": now,
        "exp": now + 600,
        "nonce": NONCE,
        **overrides,
    }
    return jwt.encode({"alg": "RS256", "kid": "pytest-key"}, claims, key)


def _parse(id_token: str, nonce: str = NONCE):
    return asyncio.run(oauth.google.parse_id_token({"id_token": id_token, "access_token": "at"}, nonce))


def test_valid_id_token_yields_userinfo():
    userinfo = _parse(_id_token())
    assert userinfo["sub"] == "google-sub-123"
    assert userinfo["email"] == "student@cornell.edu"
    assert userinfo["email_verified"] is True


@pytest.mark.parametrize(
    "id_token, nonce",
    [
        pytest.param(_id_token(key=OTHER_KEY), NONCE, id="bad-signature"),
        pytest.param(_id_token(aud="someone-elses-client"), NONCE, id="wrong-audience"),
        pytest.param(_id_token(iss="https://evil.example"), NONCE, id="wrong-issuer"),
        pytest.param(_id_token(exp=int(time.time()) - 3600), NONCE, id="expired"),
        pytest.param(_id_token(), "a-different-nonce", id="wrong-nonce"),
    ],
)
def test_untrustworthy_id_token_is_rejected(id_token, nonce):
    with pytest.raises(JoseError):
        _parse(id_token, nonce)
