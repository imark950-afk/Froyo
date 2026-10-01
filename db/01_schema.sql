-- Froyo on the go: database tables (Neon, London region).
-- Tables live in the private "app" schema, which the Data API never exposes.
-- The app can only call the functions in the "api" schema (see 02_functions.sql).

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS api;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON SCHEMA api FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE app.packages (id text PRIMARY KEY, name text NOT NULL, cups int NOT NULL CHECK (cups > 0), price_pence int NOT NULL CHECK (price_pence >= 0), sort int NOT NULL DEFAULT 0);
CREATE TABLE app.addons (id text PRIMARY KEY, name text NOT NULL, per text NOT NULL CHECK (per IN ('guest','event')), price_pence int NOT NULL CHECK (price_pence >= 0), sort int NOT NULL DEFAULT 0);

-- Who is staff. Only the database owner can add rows (Neon console SQL editor).
CREATE TABLE app.staff (user_id text PRIMARY KEY, note text, added_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE app.members (
  user_id text PRIMARY KEY,
  member_no text NOT NULL UNIQUE CHECK (member_no ~ '^FR-[0-9]{5}$'),
  name text CHECK (char_length(name) <= 80),
  birthday text CHECK (char_length(birthday) <= 30),
  stamps int NOT NULL DEFAULT 0 CHECK (stamps BETWEEN 0 AND 8),
  rewards int NOT NULL DEFAULT 0 CHECK (rewards BETWEEN 0 AND 50),
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE app.stamp_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES app.members(user_id),
  kind text NOT NULL CHECK (kind IN ('stamp','bonus','redeem')),
  n int NOT NULL CHECK (n BETWEEN 0 AND 6),
  where_text text CHECK (char_length(where_text) <= 120),
  staff_user_id text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON app.stamp_events (user_id, created_at DESC);

CREATE TABLE app.bookings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref text NOT NULL UNIQUE,
  user_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('wedding','corporate','birthday','school','festival','other')),
  unit text NOT NULL CHECK (unit IN ('cart','trailer')),
  event_date date NOT NULL,
  start_time text NOT NULL CHECK (start_time IN ('11:00','13:00','15:00','18:00')),
  guests int NOT NULL CHECK (guests BETWEEN 10 AND 400),
  package_id text NOT NULL REFERENCES app.packages(id),
  addons text[] NOT NULL DEFAULT '{}',
  venue text NOT NULL CHECK (char_length(venue) BETWEEN 2 AND 200),
  postcode text NOT NULL CHECK (postcode ~* '^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$'),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (char_length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text NOT NULL CHECK (char_length(phone) <= 30),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  total_pence int NOT NULL CHECK (total_pence >= 0),
  deposit_pence int NOT NULL CHECK (deposit_pence >= 0),
  status text NOT NULL DEFAULT 'pending_deposit' CHECK (status IN ('pending_deposit','deposit_paid','confirmed','cancelled')),
  bonus_awarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());
-- One booking per setup per start time (stops double bookings, even at the same instant).
CREATE UNIQUE INDEX bookings_one_per_slot ON app.bookings (unit, event_date, start_time) WHERE status <> 'cancelled';
CREATE INDEX ON app.bookings (user_id, created_at DESC);

CREATE TABLE app.trailer_stops (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_date date NOT NULL, time_from text NOT NULL, time_to text NOT NULL,
  place text NOT NULL CHECK (char_length(place) <= 80),
  area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 120),
  postcode text NOT NULL DEFAULT '' CHECK (char_length(postcode) <= 10),
  is_private boolean NOT NULL DEFAULT false,
  map_x int, map_y int);
CREATE TABLE app.trailer_live (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), live boolean NOT NULL DEFAULT false, stop_id int REFERENCES app.trailer_stops(id), updated_at timestamptz NOT NULL DEFAULT now());

-- Row-level security on every table, with no policies: the app roles can't read or write
-- any table directly, even if a grant is added by mistake.
ALTER TABLE app.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.stamp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trailer_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trailer_live ENABLE ROW LEVEL SECURITY;

INSERT INTO app.packages (id,name,cups,price_pence,sort) VALUES ('popup','Pop-up',60,39500,1),('party','Party',130,69500,2),('festival','Festival',400,115000,3);
INSERT INTO app.addons (id,name,per,price_pence,sort) VALUES ('toppings','Unlimited toppings bar','guest',150,1),('cones','Waffle cones','guest',75,2),('vegan','Dairy-free sorbet station','event',6000,3),('branded','Branded cups','event',9500,4),('server','Extra server','event',9000,5);
