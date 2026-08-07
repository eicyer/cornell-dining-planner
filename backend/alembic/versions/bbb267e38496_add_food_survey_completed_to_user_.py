"""add food survey completed to user preferences

Revision ID: bbb267e38496
Revises: 501d929586b1
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bbb267e38496'
down_revision: Union[str, None] = '501d929586b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_preferences',
        sa.Column('food_survey_completed', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Existing rows are backfilled to false by server_default above — that's
    # intentional, not just a migration convenience: every current user, not
    # only new signups, should be prompted with the survey once on next
    # login. Drop the server default afterward so future inserts rely on the
    # Python-side model default instead of a permanent DB-level default.
    op.alter_column('user_preferences', 'food_survey_completed', server_default=None)


def downgrade() -> None:
    op.drop_column('user_preferences', 'food_survey_completed')
