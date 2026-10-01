-- Trailer stops managed from the app (store admins and administrators).
-- Dates use UK time so "today" matches what staff and customers see.

ALTER TABLE app.trailer_stops ADD COLUMN IF NOT EXISTS lat double precision CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE app.trailer_stops ADD COLUMN IF NOT EXISTS lng double precision CHECK (lng BETWEEN -180 AND 180);
ALTER TABLE app.trailer_stops ADD COLUMN IF NOT EXISTS updated_by text;

CREATE OR REPLACE FUNCTION app.uk_today() RETURNS date
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT (now() AT TIME ZONE 'Europe/London')::date $$;

CREATE OR REPLACE FUNCTION app.uk_now_hhmm() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT to_char(now() AT TIME ZONE 'Europe/London', 'HH24:MI') $$;

CREATE OR REPLACE FUNCTION app.stop_json(s app.trailer_stops, p_full boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'date', s.stop_date, 'day', s.stop_date - app.uk_today(), 'from', s.time_from, 'to', s.time_to,
    'private', s.is_private,
    'place', CASE WHEN s.is_private AND NOT p_full THEN 'Private event' ELSE s.place END,
    'area',  CASE WHEN s.is_private AND NOT p_full THEN '' ELSE s.area END,
    'pc',    CASE WHEN s.is_private AND NOT p_full THEN '' ELSE s.postcode END,
    'lat',   CASE WHEN s.is_private AND NOT p_full THEN NULL ELSE s.lat END,
    'lng',   CASE WHEN s.is_private AND NOT p_full THEN NULL ELSE s.lng END,
    'x', s.map_x, 'y', s.map_y)
$$;

-- Public view: this week's stops; "live" only counts if the live stop is today.
CREATE OR REPLACE FUNCTION api.get_trailer() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'live', coalesce(l.live AND ls.stop_date = app.uk_today(), false),
    'now_id', CASE WHEN l.live AND ls.stop_date = app.uk_today() THEN l.stop_id END,
    'updated', l.updated_at,
    'stops', coalesce((SELECT jsonb_agg(app.stop_json(s, false) ORDER BY s.stop_date, s.time_from)
      FROM app.trailer_stops s WHERE s.stop_date BETWEEN app.uk_today() AND app.uk_today() + 6), '[]'::jsonb))
  FROM (SELECT 1) one LEFT JOIN app.trailer_live l ON l.id = 1 LEFT JOIN app.trailer_stops ls ON ls.id = l.stop_id
$$;

-- Staff view: everything from yesterday to 60 days ahead, private details included.
CREATE OR REPLACE FUNCTION api.staff_stops() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  RETURN jsonb_build_object('trailer', api.get_trailer(),
    'stops', coalesce((SELECT jsonb_agg(app.stop_json(s, true) ORDER BY s.stop_date, s.time_from)
      FROM app.trailer_stops s WHERE s.stop_date BETWEEN app.uk_today() - 1 AND app.uk_today() + 60), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION api.staff_save_stop(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_manager(); d date; tf text; tt text; pl text; ar text; pc text; pv boolean; la double precision; ln double precision; sid int;
BEGIN
  d  := (p->>'date')::date;
  tf := p->>'from'; tt := p->>'to';
  pl := btrim(coalesce(p->>'place','')); ar := btrim(coalesce(p->>'area','')); pc := upper(btrim(coalesce(p->>'postcode','')));
  pv := coalesce((p->>'private')::boolean, false);
  la := nullif(p->>'lat','')::double precision; ln := nullif(p->>'lng','')::double precision;
  IF d IS NULL OR d < app.uk_today() OR d > app.uk_today() + 365 THEN RAISE EXCEPTION 'Pick a date from today up to a year ahead' USING ERRCODE = '22023'; END IF;
  IF tf !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR tt !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Enter times like 11:00' USING ERRCODE = '22023'; END IF;
  IF tt <= tf THEN RAISE EXCEPTION 'The finish time must be after the start time' USING ERRCODE = '22023'; END IF;
  IF char_length(pl) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Enter the place name' USING ERRCODE = '22023'; END IF;
  IF char_length(ar) > 120 OR char_length(pc) > 10 THEN RAISE EXCEPTION 'Please shorten the details' USING ERRCODE = '22023'; END IF;
  IF (la IS NULL) <> (ln IS NULL) OR la NOT BETWEEN -90 AND 90 OR ln NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Location not recognised' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM app.trailer_stops WHERE stop_date = d) >= 12 AND p->>'id' IS NULL THEN RAISE EXCEPTION 'That day already has 12 stops' USING ERRCODE = '54000'; END IF;
  IF p->>'id' IS NOT NULL THEN
    UPDATE app.trailer_stops SET stop_date = d, time_from = tf, time_to = tt, place = pl, area = ar, postcode = pc,
      is_private = pv, lat = la, lng = ln, updated_by = me, map_x = NULL, map_y = NULL
    WHERE id = (p->>'id')::int RETURNING id INTO sid;
    IF sid IS NULL THEN RAISE EXCEPTION 'Stop not found' USING ERRCODE = 'P0002'; END IF;
  ELSE
    INSERT INTO app.trailer_stops (stop_date, time_from, time_to, place, area, postcode, is_private, lat, lng, updated_by)
    VALUES (d, tf, tt, pl, ar, pc, pv, la, ln, me) RETURNING id INTO sid;
  END IF;
  IF pv THEN UPDATE app.trailer_live SET live = false, updated_at = now() WHERE id = 1 AND stop_id = sid; END IF;
  RETURN api.staff_stops() || jsonb_build_object('saved_id', sid);
END $$;

CREATE OR REPLACE FUNCTION api.staff_delete_stop(p_id int) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  UPDATE app.trailer_live SET live = false, stop_id = NULL, updated_at = now() WHERE id = 1 AND stop_id = p_id;
  DELETE FROM app.trailer_stops WHERE id = p_id;
  RETURN api.staff_stops();
END $$;

-- "Serving here now": make a public stop for today starting now, and share it.
CREATE OR REPLACE FUNCTION api.staff_go_live_here(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb; sid int;
BEGIN
  PERFORM app.require_manager();
  r := api.staff_save_stop(jsonb_build_object('date', app.uk_today(), 'from', app.uk_now_hhmm(), 'to', p->>'to',
         'place', p->>'place', 'area', p->>'area', 'postcode', p->>'postcode', 'private', false, 'lat', p->>'lat', 'lng', p->>'lng'));
  sid := (r->>'saved_id')::int;
  INSERT INTO app.trailer_live (id, live, stop_id, updated_at) VALUES (1, true, sid, now())
  ON CONFLICT (id) DO UPDATE SET live = true, stop_id = sid, updated_at = now();
  RETURN api.staff_stops();
END $$;

-- Live switch / pick a stop: today's public stops only.
CREATE OR REPLACE FUNCTION api.staff_set_live(p_live boolean, p_stop_id int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  IF p_stop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.trailer_stops WHERE id = p_stop_id AND NOT is_private AND stop_date = app.uk_today()) THEN
    RAISE EXCEPTION 'Pick one of today''s public stops' USING ERRCODE = '22023';
  END IF;
  IF p_live AND p_stop_id IS NULL AND NOT EXISTS (SELECT 1 FROM app.trailer_live l JOIN app.trailer_stops s ON s.id = l.stop_id WHERE l.id = 1 AND s.stop_date = app.uk_today() AND NOT s.is_private) THEN
    RAISE EXCEPTION 'Pick where the trailer is serving first' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.trailer_live (id, live, stop_id, updated_at) VALUES (1, p_live, p_stop_id, now())
  ON CONFLICT (id) DO UPDATE SET live = EXCLUDED.live, stop_id = coalesce(EXCLUDED.stop_id, app.trailer_live.stop_id), updated_at = now();
  RETURN api.get_trailer();
END $$;

REVOKE ALL ON FUNCTION app.uk_today(), app.uk_now_hhmm(), app.stop_json(app.trailer_stops, boolean) FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION api.staff_stops(), api.staff_save_stop(jsonb), api.staff_delete_stop(int), api.staff_go_live_here(jsonb), api.staff_set_live(boolean, int) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.staff_stops(), api.staff_save_stop(jsonb), api.staff_delete_stop(int), api.staff_go_live_here(jsonb), api.staff_set_live(boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION api.get_trailer() TO anonymous, authenticated;
NOTIFY pgrst, 'reload schema';
