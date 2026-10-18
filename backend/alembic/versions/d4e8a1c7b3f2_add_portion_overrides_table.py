"""add portion overrides table

Revision ID: d4e8a1c7b3f2
Revises: 03f79f956990
Create Date: 2026-10-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e8a1c7b3f2'
down_revision: Union[str, None] = '03f79f956990'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'portion_overrides',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_name', sa.String(), nullable=False),
        sa.Column('unit', sa.String(), nullable=False),
        sa.Column('grams_per_unit', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index(op.f('ix_portion_overrides_item_name'), 'portion_overrides', ['item_name'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_portion_overrides_item_name'), table_name='portion_overrides')
    op.drop_table('portion_overrides')
