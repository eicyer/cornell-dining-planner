"""Every mutating route must reject an unauthenticated request with 401
before touching the database — see app.core.deps.get_current_user. Origin
header is set on each request so these pass the CSRF check
(app.core.csrf) and actually reach the auth dependency being tested."""

import pytest

from tests.conftest import ALLOWED_ORIGIN

MUTATING_REQUESTS = [
    ("PUT", "/preferences", {}),
    ("POST", "/preferences/food-survey", {"responses": []}),
    ("POST", "/preferences/station-survey/1", {"responses": []}),
    ("POST", "/logged-meals", {"eatery_id": 1, "meal_period": "Lunch", "items": []}),
    ("PATCH", "/logged-meals/1", {"liked": True}),
    ("PUT", "/admin/api/foods/detail", {}),
]


@pytest.mark.parametrize("method,path,body", MUTATING_REQUESTS)
def test_unauthenticated_mutation_is_rejected(client, method, path, body):
    response = client.request(method, path, json=body, headers={"Origin": ALLOWED_ORIGIN})
    assert response.status_code == 401
