"""add macro style and whole foods preference

Revision ID: 501d929586b1
Revises: 6e396b04de29
Create Date: 2026-08-05 11:07:33.005198

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '501d929586b1'
down_revision: Union[str, None] = '6e396b04de29'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

macro_style_enum = sa.Enum('balanced', 'lower_carb', name='macrostyle')


def upgrade() -> None:
    bind = op.get_bind()
    macro_style_enum.create(bind, checkfirst=True)

    op.add_column('user_preferences', sa.Column('macro_style', macro_style_enum, nullable=True))
    op.add_column(
        'user_preferences',
        sa.Column('prefer_whole_foods', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Existing rows are backfilled by server_default above; drop it afterward
    # so future inserts rely on the Python-side model default instead of a
    # permanent DB-level default.
    op.alter_column('user_preferences', 'prefer_whole_foods', server_default=None)


def downgrade() -> None:
    op.drop_column('user_preferences', 'prefer_whole_foods')
    op.drop_column('user_preferences', 'macro_style')

    bind = op.get_bind()
    macro_style_enum.drop(bind, checkfirst=True)
