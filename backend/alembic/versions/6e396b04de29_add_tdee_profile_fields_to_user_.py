"""add tdee profile fields to user_preferences

Revision ID: 6e396b04de29
Revises: 30bd5b7377ec
Create Date: 2026-08-04 17:16:14.105069

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e396b04de29'
down_revision: Union[str, None] = '30bd5b7377ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

sex_enum = sa.Enum('male', 'female', name='sex')
activity_level_enum = sa.Enum('sedentary', 'light', 'moderate', 'active', 'very_active', name='activitylevel')
health_goal_enum = sa.Enum('lose_weight', 'maintain_weight', 'gain_weight', name='healthgoal')
target_mode_enum = sa.Enum('recommended', 'manual', name='targetmode')


def upgrade() -> None:
    bind = op.get_bind()
    sex_enum.create(bind, checkfirst=True)
    activity_level_enum.create(bind, checkfirst=True)
    health_goal_enum.create(bind, checkfirst=True)
    target_mode_enum.create(bind, checkfirst=True)

    op.add_column('user_preferences', sa.Column('age', sa.Integer(), nullable=True))
    op.add_column('user_preferences', sa.Column('sex', sex_enum, nullable=True))
    op.add_column('user_preferences', sa.Column('height_cm', sa.Float(), nullable=True))
    op.add_column('user_preferences', sa.Column('weight_kg', sa.Float(), nullable=True))
    op.add_column('user_preferences', sa.Column('activity_level', activity_level_enum, nullable=True))
    op.add_column('user_preferences', sa.Column('health_goal', health_goal_enum, nullable=True))
    op.add_column(
        'user_preferences',
        sa.Column('target_mode', target_mode_enum, nullable=False, server_default='manual'),
    )
    # Existing rows are backfilled by server_default above; drop it afterward
    # so future inserts rely on the Python-side model default instead of a
    # permanent DB-level default.
    op.alter_column('user_preferences', 'target_mode', server_default=None)


def downgrade() -> None:
    op.drop_column('user_preferences', 'target_mode')
    op.drop_column('user_preferences', 'health_goal')
    op.drop_column('user_preferences', 'activity_level')
    op.drop_column('user_preferences', 'weight_kg')
    op.drop_column('user_preferences', 'height_cm')
    op.drop_column('user_preferences', 'sex')
    op.drop_column('user_preferences', 'age')

    bind = op.get_bind()
    target_mode_enum.drop(bind, checkfirst=True)
    health_goal_enum.drop(bind, checkfirst=True)
    activity_level_enum.drop(bind, checkfirst=True)
    sex_enum.drop(bind, checkfirst=True)
