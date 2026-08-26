"""add stale and build_count to crafted meals cache

Revision ID: c1a7f3e9b2d4
Revises: 50a88b7d0fed
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1a7f3e9b2d4'
down_revision: Union[str, None] = '50a88b7d0fed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'crafted_meals_cache',
        sa.Column('stale', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'crafted_meals_cache',
        sa.Column('build_count', sa.Integer(), nullable=False, server_default='1'),
    )
    # Existing rows were all built exactly once (the lazy path or the daily
    # cron) before this column existed — server_default='1' above backfills
    # that correctly for them; new rows set it explicitly going forward.


def downgrade() -> None:
    op.drop_column('crafted_meals_cache', 'build_count')
    op.drop_column('crafted_meals_cache', 'stale')
