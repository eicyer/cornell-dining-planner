"""Shared rate limiter — keyed by remote address, no Redis backend needed
at this scale (in-memory is fine for a single-process deploy). Applied to
the OAuth entry points (automation resistance) and the LLM-backed routes,
where an authenticated-but-abusive client can otherwise run up real
Anthropic API spend behind nothing but get_current_user — a cost-based DoS
angle, not just a generic hardening checkbox. See docs/adr/0018.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
