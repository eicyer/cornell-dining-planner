"""merge duplicate logged meals and make them unique per menu event

Revision ID: e5ff8d60b11f
Revises: d4e8a1c7b3f2
Create Date: 2026-10-20 11:05:49.024744

Before docs/adr/0023 every "Log" tap created a new Logged Meal, so a user
can already have several for one Menu Event (per-item logging made this
common). Each such group is folded into its oldest row before the unique
constraint goes on: items with the same name have their grams and stored
nutrition summed (both scale linearly with grams, so this equals what a
fresh recompute would give), totals are re-summed, and the oldest non-null
rating wins.
"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5ff8d60b11f'
down_revision: Union[str, None] = 'd4e8a1c7b3f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NUMERIC_FIELDS = ["grams", "calories", "protein_g", "carbs_g", "fat_g"]
TOTAL_FIELDS = ["calories", "protein_g", "carbs_g", "fat_g"]


def _loads(value):
    return json.loads(value) if isinstance(value, str) else value


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, user_id, menu_event_id, items, liked
            FROM logged_meals
            WHERE (user_id, menu_event_id) IN (
                SELECT user_id, menu_event_id FROM logged_meals
                WHERE menu_event_id IS NOT NULL
                GROUP BY user_id, menu_event_id HAVING count(*) > 1
            )
            ORDER BY user_id, menu_event_id, created_at, id
            """
        )
    ).mappings().all()

    groups: dict[tuple[int, int], list] = {}
    for row in rows:
        groups.setdefault((row["user_id"], row["menu_event_id"]), []).append(row)

    for meals in groups.values():
        keep, *duplicates = meals
        merged: dict[str, dict] = {}
        for meal in meals:
            for item in _loads(meal["items"]):
                if item["name"] in merged:
                    for field in NUMERIC_FIELDS:
                        merged[item["name"]][field] += item[field]
                else:
                    merged[item["name"]] = dict(item)
        items = list(merged.values())
        totals = {field: sum(i[field] for i in items) for field in TOTAL_FIELDS}
        liked = next((m["liked"] for m in meals if m["liked"] is not None), None)

        conn.execute(
            sa.text("UPDATE logged_meals SET items = :items, totals = :totals, liked = :liked WHERE id = :id"),
            {"items": json.dumps(items), "totals": json.dumps(totals), "liked": liked, "id": keep["id"]},
        )
        conn.execute(
            sa.text("DELETE FROM logged_meals WHERE id = ANY(:ids)"),
            {"ids": [m["id"] for m in duplicates]},
        )

    op.create_unique_constraint(
        'logged_meals_user_id_menu_event_id_key', 'logged_meals', ['user_id', 'menu_event_id']
    )


def downgrade() -> None:
    # The merge itself isn't reversible — only the constraint is dropped.
    op.drop_constraint('logged_meals_user_id_menu_event_id_key', 'logged_meals', type_='unique')
