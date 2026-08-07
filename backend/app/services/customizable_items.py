"""Registry of Menu Items that Cornell serves as a single build-your-own dish
rather than a fixed recipe — see docs/adr/0010-customizable-items.md.

The dining feed lists these as one generic name with no protein specified.
Treating that name as one atomic Menu Item (the default for everything else)
would leave its Nutrition Match ambiguous and let the optimizer gram-scale it
like a scoop of rice, when in reality it's only ever served as a full plate.
This registry expands one raw name into its real protein variants before
enrichment and candidate generation ever see it, so each variant gets its own
Nutrition Match/Diet Tag and the optimizer treats the dish as indivisible.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CustomizableItem:
    variants: tuple[str, ...]
    plate_grams: float


CUSTOMIZABLE_ITEMS: dict[str, CustomizableItem] = {
    "Customizable Iron Grill Stir-Fry": CustomizableItem(
        variants=("Pork", "Chicken", "Tofu"),
        plate_grams=450.0,
    ),
}

_VARIANT_PLATE_GRAMS: dict[str, float] = {
    f"{base} ({variant})": spec.plate_grams
    for base, spec in CUSTOMIZABLE_ITEMS.items()
    for variant in spec.variants
}


def variant_names(base_name: str) -> list[str]:
    """The Menu Item names to treat `base_name` as once expanded — its
    per-protein variants if it's customizable, otherwise just itself."""
    spec = CUSTOMIZABLE_ITEMS.get(base_name)
    if spec is None:
        return [base_name]
    return [f"{base_name} ({variant})" for variant in spec.variants]


def plate_grams_for(item_name: str) -> float | None:
    """None for any ordinary Menu Item — only a customizable item's variant
    names have a fixed whole-plate serving."""
    return _VARIANT_PLATE_GRAMS.get(item_name)
