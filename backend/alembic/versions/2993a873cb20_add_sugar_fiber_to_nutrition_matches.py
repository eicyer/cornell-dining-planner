"""add sugar and fiber to nutrition matches

Revision ID: 2993a873cb20
Revises: bbb267e38496
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2993a873cb20'
down_revision: Union[str, None] = 'bbb267e38496'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable, unlike calories/protein/carbs/fat: existing rows start out
    # without these and are backfilled by app.jobs.enrich_items over time
    # rather than in this migration — see docs/adr/0014-sugar-fiber-tracking.
    op.add_column('nutrition_matches', sa.Column('sugar_g_per_100g', sa.Float(), nullable=True))
    op.add_column('nutrition_matches', sa.Column('fiber_g_per_100g', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('nutrition_matches', 'fiber_g_per_100g')
    op.drop_column('nutrition_matches', 'sugar_g_per_100g')
