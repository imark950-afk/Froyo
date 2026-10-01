-- Booking restrictions: store admins and administrators can block start times
-- for the cart, the trailer or both, between two dates.
-- Customers see blocked times as unavailable; create_booking refuses them.

CREATE TABLE IF NOT EXISTS app.booking_blocks (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date_from date NOT NULL,
  date_to date NOT NULL,
  unit text NOT NULL CHECK (unit IN ('cart','trailer','both')),
  times text[] NOT NULL DEFAULT '{}',          -- empty = whole day
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 120),   -- staff only, never shown to customers
  created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from AND date_to - date_from <= 731),
  CHECK (times <@ ARRAY['11:00','13:00','15:00','18:00']::text[]));
ALTER TABLE app.booking_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.booking_blocks FROM PUBLIC, anonymous, authenticated;
CREATE INDEX IF NOT EXISTS booking_blocks_dates ON app.booking_blocks (date_from, date_to);

-- Is this start time blocked?
CREATE OR REPLACE FUNCTION app.is_blocked(p_unit text, p_date date, p_time text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM app.booking_blocks b
    WHERE p_date BETWEEN b.date_from AND b.date_to AND b.unit IN (p_unit, 'both')
      AND (cardinality(b.times) = 0 OR p_time = ANY (b.times)))
$$;

-- Availability now includes blocked times (shown to customers simply as unavailable).
CREATE OR REPLACE FUNCTION api.get_availability(p_unit text, p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m0 date := date_trunc('month', p_month)::date;
BEGIN
  IF p_unit NOT IN ('cart','trailer') THEN RAISE EXCEPTION 'Unknown setup' USING ERRCODE = '22023'; END IF;
  IF m0 < date_trunc('month', current_date) OR m0 > current_date + 730 THEN RETURN '{}'::jsonb; END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(d::text, times) FROM (
      SELECT d, jsonb_agg(DISTINCT t ORDER BY t) AS times FROM (
        SELECT event_date AS d, start_time AS t FROM app.bookings
          WHERE unit = p_unit AND status <> 'cancelled' AND event_date >= m0 AND event_date < (m0 + interval '1 month')
        UNION
        SELECT g::date, s.t FROM app.booking_blocks b
          CROSS JOIN LATERAL generate_series(greatest(b.date_from, m0), least(b.date_to, (m0 + interval '1 month' - interval '1 day')::date), interval '1 day') g
          CROSS JOIN LATERAL unnest(CASE WHEN cardinality(b.times) = 0 THEN ARRAY['11:00','13:00','15:00','18:00'] ELSE b.times END) AS s(t)
          WHERE b.unit IN (p_unit, 'both') AND b.date_to >= m0 AND b.date_from < (m0 + interval '1 month')
      ) x GROUP BY d) y), '{}'::jsonb);
END $$;

-- Staff: list, save, delete restrictions.
CREATE OR REPLACE FUNCTION api.staff_blocks() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'from', b.date_from, 'to', b.date_to, 'unit', b.unit,
      'times', to_jsonb(b.times), 'note', b.note) ORDER BY b.date_from, b.id)
    FROM app.booking_blocks b WHERE b.date_to >= current_date - 1), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION api.staff_save_block(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_manager(); df date; dt date; u text; ts text[]; nt text; clash int;
BEGIN
  df := (p->>'from')::date; dt := coalesce(nullif(p->>'to','')::date, df);
  u := coalesce(p->>'unit','both'); nt := btrim(coalesce(p->>'note',''));
  SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}') INTO ts FROM jsonb_array_elements_text(coalesce(p->'times','[]'::jsonb)) x;
  IF df IS NULL OR df < current_date - 1 THEN RAISE EXCEPTION 'Pick a start date from today' USING ERRCODE = '22023'; END IF;
  IF dt < df THEN RAISE EXCEPTION 'The end date must be on or after the start date' USING ERRCODE = '22023'; END IF;
  IF dt - df > 731 THEN RAISE EXCEPTION 'Restrictions can cover up to 2 years' USING ERRCODE = '22023'; END IF;
  IF u NOT IN ('cart','trailer','both') THEN RAISE EXCEPTION 'Pick cart, trailer or both' USING ERRCODE = '22023'; END IF;
  IF NOT ts <@ ARRAY['11:00','13:00','15:00','18:00'] THEN RAISE EXCEPTION 'Unknown start time' USING ERRCODE = '22023'; END IF;
  IF char_length(nt) > 120 THEN RAISE EXCEPTION 'Please shorten the note' USING ERRCODE = '22023'; END IF;
  IF p->>'id' IS NULL AND (SELECT count(*) FROM app.booking_blocks WHERE date_to >= current_date) >= 200 THEN
    RAISE EXCEPTION 'Too many restrictions. Delete some old ones first.' USING ERRCODE = '54000';
  END IF;
  IF p->>'id' IS NOT NULL THEN
    UPDATE app.booking_blocks SET date_from = df, date_to = dt, unit = u, times = ts, note = nt, created_by = me WHERE id = (p->>'id')::int;
    IF NOT FOUND THEN RAISE EXCEPTION 'Restriction not found' USING ERRCODE = 'P0002'; END IF;
  ELSE
    INSERT INTO app.booking_blocks (date_from, date_to, unit, times, note, created_by) VALUES (df, dt, u, ts, nt, me);
  END IF;
  -- Tell staff about existing bookings inside the new restriction (they are NOT cancelled automatically).
  SELECT count(*) INTO clash FROM app.bookings k
    WHERE k.status <> 'cancelled' AND k.event_date BETWEEN df AND dt AND (u = 'both' OR k.unit = u)
      AND (cardinality(ts) = 0 OR k.start_time = ANY (ts));
  RETURN jsonb_build_object('blocks', api.staff_blocks(), 'existing_bookings', clash);
END $$;

CREATE OR REPLACE FUNCTION api.staff_delete_block(p_id int) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  DELETE FROM app.booking_blocks WHERE id = p_id;
  RETURN jsonb_build_object('blocks', api.staff_blocks());
END $$;

REVOKE ALL ON FUNCTION app.is_blocked(text, date, text) FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION api.staff_blocks(), api.staff_save_block(jsonb), api.staff_delete_block(int) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.staff_blocks(), api.staff_save_block(jsonb), api.staff_delete_block(int) TO authenticated;
GRANT EXECUTE ON FUNCTION api.get_availability(text, date) TO anonymous, authenticated;
