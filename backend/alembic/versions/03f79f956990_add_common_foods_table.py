"""add common foods table

Revision ID: 03f79f956990
Revises: c1a7f3e9b2d4
Create Date: 2026-09-01 00:00:00.000000

"""
import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '03f79f956990'
down_revision: Union[str, None] = 'c1a7f3e9b2d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Seed catalog — see docs/adr/0020-common-foods-catalog. `subtype` is the
# contrast/grouping key app.services.meal_preference_survey pairs across
# within a (meal_period, role) bucket; `tags` are substring-matchable
# human phrases feeding the existing liked_tags/disliked_tags scoring
# (app.services.preference_scoring needs no changes to consume them).
_NOW = datetime.datetime.utcnow()

_SEED_FOODS = [
    # --- Breakfast ---------------------------------------------------
    ("Scrambled Eggs", "breakfast", "protein", "egg", ["egg"], ["vegetarian", "gluten_free"], ["eggs", "dairy"]),
    ("Hard-Boiled Eggs", "breakfast", "protein", "egg", ["egg"],
     ["vegetarian", "gluten_free", "dairy_free"], ["eggs"]),
    ("Sausage Links", "breakfast", "protein", "sausage", ["sausage"], [], []),
    ("Turkey Sausage", "breakfast", "protein", "sausage", ["turkey sausage", "sausage"], [], []),
    ("Bacon", "breakfast", "protein", "bacon", ["bacon"], [], []),
    ("Scrambled Tofu", "breakfast", "protein", "tofu", ["tofu"], ["vegan", "vegetarian", "dairy_free"], ["soy"]),
    ("Greek Yogurt", "breakfast", "protein", "dairy_protein", ["yogurt"], ["vegetarian", "gluten_free"], ["dairy"]),

    ("Sauteed Spinach", "breakfast", "vegetable", "leafy_green", ["spinach"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Roasted Tomatoes", "breakfast", "vegetable", "roasted_veg", ["tomato", "tomatoes"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Fresh Fruit", "breakfast", "vegetable", "fruit", ["fruit"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),

    ("Bagels", "breakfast", "carb", "bread", ["bagel"], ["vegetarian"], ["gluten"]),
    ("Pancakes", "breakfast", "carb", "pancake", ["pancake"], ["vegetarian"], ["gluten", "dairy", "eggs"]),
    ("French Toast", "breakfast", "carb", "bread", ["french toast"], ["vegetarian"], ["gluten", "dairy", "eggs"]),
    ("Oatmeal", "breakfast", "carb", "oats", ["oatmeal", "oats"], ["vegan", "vegetarian", "dairy_free"], ["gluten"]),
    ("Home Fries", "breakfast", "carb", "potato", ["home fries", "potato"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Hash Browns", "breakfast", "carb", "potato", ["hash browns", "potato"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Waffles", "breakfast", "carb", "waffle", ["waffle"], ["vegetarian"], ["gluten", "dairy", "eggs"]),
    ("Cold Cereal", "breakfast", "carb", "grain", ["cereal"], ["vegan", "vegetarian", "dairy_free"], ["gluten"]),

    # --- Lunch ---------------------------------------------------------
    ("Grilled Chicken Breast", "lunch", "protein", "chicken", ["chicken", "grilled chicken"], ["gluten_free"], []),
    ("Turkey Burger", "lunch", "protein", "minced_meat", ["turkey burger", "turkey"], [], ["gluten"]),
    ("Beef Burger", "lunch", "protein", "minced_meat", ["beef burger", "beef"], [], ["gluten"]),
    ("Grilled Salmon", "lunch", "protein", "fish", ["salmon", "fish"], ["gluten_free", "dairy_free"], ["fish"]),
    ("Black Bean Burger", "lunch", "protein", "plant_protein", ["black bean burger", "black bean"],
     ["vegan", "vegetarian", "dairy_free"], ["gluten"]),
    ("Tofu Stir-Fry", "lunch", "protein", "tofu", ["tofu", "stir-fry"],
     ["vegan", "vegetarian", "dairy_free"], ["soy", "sesame"]),
    ("Turkey Chili", "lunch", "protein", "minced_meat", ["turkey chili", "turkey"], ["gluten_free"], []),

    ("Garden Salad", "lunch", "vegetable", "garden_salad", ["garden salad", "salad"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Caesar Salad", "lunch", "vegetable", "caesar_salad", ["caesar salad", "salad"],
     ["vegetarian"], ["dairy", "gluten"]),
    ("Greek Salad", "lunch", "vegetable", "greek_salad", ["greek salad", "feta"],
     ["vegetarian", "gluten_free"], ["dairy"]),
    ("Cucumber Tomato Salad", "lunch", "vegetable", "cucumber_tomato_salad", ["cucumber tomato salad", "salad"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Roasted Vegetable Medley", "lunch", "vegetable", "roasted_veg", ["roasted vegetables"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),

    ("French Fries", "lunch", "carb", "potato", ["french fries", "fries"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("White Rice", "lunch", "carb", "rice", ["rice"], ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Pasta", "lunch", "carb", "pasta", ["pasta"], ["vegetarian"], ["gluten"]),
    ("Dinner Roll", "lunch", "carb", "bread", ["roll", "bread"], ["vegetarian"], ["gluten"]),
    ("Quinoa", "lunch", "carb", "grain", ["quinoa"], ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),

    # --- Dinner ----------------------------------------------------
    ("Grilled Chicken Breast", "dinner", "protein", "chicken", ["chicken", "grilled chicken"], ["gluten_free"], []),
    ("Baked Salmon", "dinner", "protein", "fish", ["salmon", "fish"], ["gluten_free", "dairy_free"], ["fish"]),
    ("Baked Tilapia", "dinner", "protein", "fish", ["tilapia", "fish"], ["gluten_free", "dairy_free"], ["fish"]),
    ("Meatballs", "dinner", "protein", "minced_meat", ["meatballs"], [], ["gluten", "eggs"]),
    ("Beef Meatloaf", "dinner", "protein", "minced_meat", ["meatloaf", "beef"], [], ["gluten", "eggs"]),
    ("Pulled Pork", "dinner", "protein", "pork", ["pulled pork", "pork"], ["gluten_free", "dairy_free"], []),
    ("Roast Turkey", "dinner", "protein", "turkey", ["roast turkey", "turkey"], ["gluten_free", "dairy_free"], []),
    ("Sesame Marinated Tofu", "dinner", "protein", "tofu", ["tofu", "sesame"],
     ["vegan", "vegetarian", "dairy_free", "gluten_free"], ["soy", "sesame"]),
    ("Chickpea Curry", "dinner", "protein", "plant_protein", ["chickpea curry", "chickpea"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),

    ("Roasted Broccoli", "dinner", "vegetable", "roasted_veg", ["broccoli"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Sauteed Green Beans", "dinner", "vegetable", "roasted_veg", ["green beans"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Caesar Salad", "dinner", "vegetable", "caesar_salad", ["caesar salad", "salad"],
     ["vegetarian"], ["dairy", "gluten"]),
    ("Roasted Brussels Sprouts", "dinner", "vegetable", "roasted_veg", ["brussels sprouts"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),

    ("Mashed Potatoes", "dinner", "carb", "potato", ["mashed potatoes", "potato"],
     ["vegetarian", "gluten_free"], ["dairy"]),
    ("Steamed Jasmine Rice", "dinner", "carb", "rice", ["jasmine rice", "rice"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
    ("Pasta Marinara", "dinner", "carb", "pasta", ["pasta marinara", "pasta"],
     ["vegan", "vegetarian", "dairy_free"], ["gluten"]),
    ("Roasted Potatoes", "dinner", "carb", "potato", ["roasted potatoes", "potato"],
     ["vegan", "vegetarian", "gluten_free", "dairy_free"], []),
]


def upgrade() -> None:
    op.create_table(
        'common_foods',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('meal_period', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('subtype', sa.String(), nullable=False),
        sa.Column('tags', sa.ARRAY(sa.String()), nullable=False),
        sa.Column('diet_tags', sa.ARRAY(sa.String()), nullable=False),
        sa.Column('allergens', sa.ARRAY(sa.String()), nullable=False),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    common_foods = sa.table(
        'common_foods',
        sa.column('name', sa.String()),
        sa.column('meal_period', sa.String()),
        sa.column('role', sa.String()),
        sa.column('subtype', sa.String()),
        sa.column('tags', sa.ARRAY(sa.String())),
        sa.column('diet_tags', sa.ARRAY(sa.String())),
        sa.column('allergens', sa.ARRAY(sa.String())),
        sa.column('active', sa.Boolean()),
        sa.column('created_at', sa.DateTime()),
        sa.column('updated_at', sa.DateTime()),
    )
    op.bulk_insert(
        common_foods,
        [
            {
                'name': name, 'meal_period': meal_period, 'role': role, 'subtype': subtype,
                'tags': tags, 'diet_tags': diet_tags, 'allergens': allergens,
                'active': True, 'created_at': _NOW, 'updated_at': _NOW,
            }
            for name, meal_period, role, subtype, tags, diet_tags, allergens in _SEED_FOODS
        ],
    )


def downgrade() -> None:
    op.drop_table('common_foods')
