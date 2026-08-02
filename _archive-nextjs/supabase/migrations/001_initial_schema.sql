-- ─── Enable UUID extension ────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Eateries ─────────────────────────────────────────────────────────────────
create table if not exists eateries (
  id          integer primary key,           -- Cornell's own eatery ID
  name        text    not null,
  location    text,
  hours_json  jsonb   default '[]'::jsonb,   -- raw operatingHours from Cornell API
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ─── Menu Items ───────────────────────────────────────────────────────────────
create type nutrition_source as enum ('cornell_api', 'usda', 'nutritionix', 'llm_estimate');
create type meal_period as enum ('breakfast', 'brunch', 'lunch', 'dinner', 'late_night');

create table if not exists menu_items (
  id                uuid primary key default uuid_generate_v4(),
  eatery_id         integer references eateries(id) on delete cascade,
  name              text not null,
  station           text,
  meal_period       meal_period not null,
  date              date not null,
  calories          numeric(7,1) not null default 0,
  protein_g         numeric(6,1) not null default 0,
  carbs_g           numeric(6,1) not null default 0,
  fat_g             numeric(6,1) not null default 0,
  fiber_g           numeric(6,1) not null default 0,
  nutrition_source  nutrition_source not null default 'llm_estimate',
  confidence_score  numeric(3,2) not null default 0.5 check (confidence_score between 0 and 1),
  dietary_tags      text[] default '{}',
  is_healthy        boolean default false,
  created_at        timestamptz default now()
);

-- Index for fast daily menu lookups
create index if not exists menu_items_eatery_date_period
  on menu_items (eatery_id, date, meal_period);

create index if not exists menu_items_date
  on menu_items (date);

-- Unique constraint: same item shouldn't be duplicated for same eatery/date/period
create unique index if not exists menu_items_unique
  on menu_items (eatery_id, name, date, meal_period);

-- ─── User Preferences ─────────────────────────────────────────────────────────
create table if not exists user_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  daily_calorie_goal    integer not null default 2000,
  protein_goal_g        integer not null default 150,
  carb_goal_g           integer not null default 200,
  fat_goal_g            integer not null default 65,
  liked_foods           text[]  default '{}',
  disliked_foods        text[]  default '{}',
  dietary_restrictions  text[]  default '{}',
  meal_count_per_day    integer not null default 3,
  onboarding_complete   boolean default false,
  updated_at            timestamptz default now()
);

-- ─── Logged Meals ─────────────────────────────────────────────────────────────
create table if not exists logged_meals (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid references auth.users(id) on delete cascade,
  date             date not null,
  meal_period      meal_period not null,
  eatery_id        integer references eateries(id),
  eatery_name      text,
  items_json       jsonb not null default '[]'::jsonb, -- array of LoggedMealItem
  total_calories   numeric(7,1) default 0,
  total_protein_g  numeric(6,1) default 0,
  total_carbs_g    numeric(6,1) default 0,
  total_fat_g      numeric(6,1) default 0,
  created_at       timestamptz default now()
);

create index if not exists logged_meals_user_date
  on logged_meals (user_id, date);

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- Eateries & menu_items: publicly readable
alter table eateries       enable row level security;
alter table menu_items     enable row level security;
alter table user_preferences enable row level security;
alter table logged_meals   enable row level security;

create policy "Eateries are public" on eateries
  for select using (true);

create policy "Menu items are public" on menu_items
  for select using (true);

create policy "Users manage own preferences" on user_preferences
  for all using (auth.uid() = user_id);

create policy "Users manage own meals" on logged_meals
  for all using (auth.uid() = user_id);

-- ─── Updated At Trigger ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger eateries_updated_at
  before update on eateries
  for each row execute function update_updated_at();

create trigger user_preferences_updated_at
  before update on user_preferences
  for each row execute function update_updated_at();
