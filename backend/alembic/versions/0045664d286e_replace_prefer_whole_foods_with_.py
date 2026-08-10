"""replace prefer_whole_foods with eating_styles

Revision ID: 0045664d286e
Revises: 2993a873cb20
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0045664d286e'
down_revision: Union[str, None] = '2993a873cb20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_preferences',
        sa.Column('eating_styles', sa.ARRAY(sa.String()), nullable=False, server_default='{}'),
    )
    # A user who'd already turned on "prefer whole & minimally processed
    # foods" keeps that signal under its new name — see
    # docs/adr/0015-eating-styles-registry — rather than silently losing it.
    op.execute(
        "UPDATE user_preferences SET eating_styles = ARRAY['whole_foods_focus'] WHERE prefer_whole_foods = true"
    )
    op.alter_column('user_preferences', 'eating_styles', server_default=None)
    op.drop_column('user_preferences', 'prefer_whole_foods')


def downgrade() -> None:
    op.add_column(
        'user_preferences',
        sa.Column('prefer_whole_foods', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        "UPDATE user_preferences SET prefer_whole_foods = true WHERE 'whole_foods_focus' = ANY(eating_styles)"
    )
    op.alter_column('user_preferences', 'prefer_whole_foods', server_default=None)
    op.drop_column('user_preferences', 'eating_styles')
