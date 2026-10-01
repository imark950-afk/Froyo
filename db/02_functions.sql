-- Froyo on the go: the only actions the app can perform.
-- Every function runs with the owner's rights but checks who is calling first.
-- search_path is pinned to '' so nothing can be hijacked by another schema.

-- ---------- helpers (private schema, not callable by the app) ----------
CREATE OR REPLACE FUNCTION app.uid() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text;
BEGIN
  u := auth.user_id();
  IF u IS NULL OR u = '' THEN
    RAISE EXCEPTION 'Sign in to do this' USING ERRCODE = '42501';
  END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION app.require_staff() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app.staff s WHERE s.user_id = u) THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE = '42501';
  END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION app.ensure_member(p_uid text) RETURNS app.members
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m app.members; candidate text; tries int := 0;
BEGIN
  SELECT * INTO m FROM app.members WHERE user_id = p_uid;
  IF FOUND THEN RETURN m; END IF;
  LOOP
    tries := tries + 1;
    candidate := 'FR-' || lpad((floor(random() * 100000))::int::text, 5, '0');
    BEGIN
      INSERT INTO app.members (user_id, member_no, name)
      VALUES (p_uid, candidate,
              left(coalesce((SELECT u.name FROM neon_auth."user" u WHERE u.id::text = p_uid), ''), 80))
      RETURNING * INTO m;
      RETURN m;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO m FROM app.members WHERE user_id = p_uid;
      IF FOUND THEN RETURN m; END IF;
      IF tries > 20 THEN RAISE; END IF;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION app.card_json(p_uid text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'member_no', m.member_no, 'name', coalesce(m.name,''), 'birthday', coalesce(m.birthday,''),
    'stamps', m.stamps, 'rewards', m.rewards, 'since', to_char(m.created_at, 'Mon YYYY'),
    'history', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'n', e.n, 'where', coalesce(e.where_text,''), 'at', e.created_at) ORDER BY e.created_at DESC)
                         FROM (SELECT * FROM app.stamp_events WHERE user_id = p_uid ORDER BY created_at DESC LIMIT 10) e), '[]'::jsonb))
  FROM app.members m WHERE m.user_id = p_uid
$$;

-- Adds stamps, turning every 9 into a free cup. Returns how many free cups were unlocked.
CREATE OR REPLACE FUNCTION app.add_stamps(p_uid text, p_n int, p_kind text, p_where text, p_staff text) RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m app.members; total int; unlocked int;
BEGIN
  SELECT * INTO m FROM app.members WHERE user_id = p_uid FOR UPDATE;
  total := m.stamps + p_n;
  unlocked := total / 9;
  UPDATE app.members SET stamps = total % 9, rewards = rewards + unlocked WHERE user_id = p_uid;
  INSERT INTO app.stamp_events (user_id, kind, n, where_text, staff_user_id) VALUES (p_uid, p_kind, p_n, left(p_where,120), p_staff);
  RETURN unlocked;
END $$;

CREATE OR REPLACE FUNCTION app.booking_json(b app.bookings) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('ref', b.ref, 'event', b.event_type, 'unit', b.unit, 'date', b.event_date, 'time', b.start_time,
    'guests', b.guests, 'pkg', b.package_id, 'addons', to_jsonb(b.addons), 'venue', b.venue, 'postcode', b.postcode,
    'name', b.contact_name, 'email', b.email, 'total', b.total_pence, 'deposit', b.deposit_pence, 'status', b.status)
$$;

-- ---------- public: anyone using the app ----------
CREATE OR REPLACE FUNCTION api.get_catalogue() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'packages', (SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'cups',cups,'price',price_pence) ORDER BY sort) FROM app.packages),
    'addons',   (SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'per',per,'price',price_pence) ORDER BY sort) FROM app.addons),
    'min_date', current_date + 7)
$$;

-- Which start times are already taken for one unit in one month. Reveals nothing about who booked.
CREATE OR REPLACE FUNCTION api.get_availability(p_unit text, p_month date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m0 date := date_trunc('month', p_month)::date;
BEGIN
  IF p_unit NOT IN ('cart','trailer') THEN RAISE EXCEPTION 'Unknown setup' USING ERRCODE = '22023'; END IF;
  IF m0 < date_trunc('month', current_date) OR m0 > current_date + 730 THEN RETURN '{}'::jsonb; END IF;
  RETURN coalesce((SELECT jsonb_object_agg(d, times) FROM (
      SELECT event_date::text AS d, jsonb_agg(start_time ORDER BY start_time) AS times
      FROM app.bookings WHERE unit = p_unit AND status <> 'cancelled'
        AND event_date >= m0 AND event_date < (m0 + interval '1 month')
      GROUP BY event_date) x), '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION api.get_trailer() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'live', coalesce(l.live, false),
    'now_id', CASE WHEN l.live THEN l.stop_id END,
    'updated', l.updated_at,
    'stops', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'day', s.stop_date - current_date, 'from', s.time_from, 'to', s.time_to,
        'private', s.is_private,
        'place', CASE WHEN s.is_private THEN 'Private event' ELSE s.place END,
        'area', CASE WHEN s.is_private THEN '' ELSE s.area END,
        'pc', CASE WHEN s.is_private THEN '' ELSE s.postcode END,
        'x', s.map_x, 'y', s.map_y) ORDER BY s.stop_date, s.time_from)
      FROM app.trailer_stops s WHERE s.stop_date BETWEEN current_date AND current_date + 6), '[]'::jsonb))
  FROM (SELECT 1) one LEFT JOIN app.trailer_live l ON l.id = 1
$$;

-- ---------- signed-in customers ----------
CREATE OR REPLACE FUNCTION api.my_card() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  PERFORM app.ensure_member(u);
  RETURN app.card_json(u) || jsonb_build_object('staff', EXISTS (SELECT 1 FROM app.staff WHERE user_id = u));
END $$;

CREATE OR REPLACE FUNCTION api.update_my_card(p_name text DEFAULT NULL, p_birthday text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  PERFORM app.ensure_member(u);
  IF p_name IS NOT NULL THEN
    IF char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Name must be 1 to 80 characters' USING ERRCODE = '22023'; END IF;
    UPDATE app.members SET name = btrim(p_name) WHERE user_id = u;
  END IF;
  IF p_birthday IS NOT NULL THEN
    IF char_length(btrim(p_birthday)) NOT BETWEEN 3 AND 30 THEN RAISE EXCEPTION 'Enter a birthday like 14 March' USING ERRCODE = '22023'; END IF;
    UPDATE app.members SET birthday = btrim(p_birthday) WHERE user_id = u AND birthday IS NULL; -- set once, so the treat can't be farmed
  END IF;
  RETURN app.card_json(u);
END $$;

CREATE OR REPLACE FUNCTION api.create_booking(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  u text := app.uid();
  pk app.packages; a record; addon_ids text[]; guests int; total int; d date; b app.bookings; r text;
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
BEGIN
  -- limits against spam / slot squatting
  IF (SELECT count(*) FROM app.bookings WHERE user_id = u AND created_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'You can make up to 5 bookings a day. Please contact us for more.' USING ERRCODE = '54000';
  END IF;
  IF (SELECT count(*) FROM app.bookings WHERE user_id = u AND status = 'pending_deposit') >= 3 THEN
    RAISE EXCEPTION 'Please pay the deposit on your existing bookings first.' USING ERRCODE = '54000';
  END IF;

  guests := (p->>'guests')::int;
  d := (p->>'date')::date;
  IF d < current_date + 7 THEN RAISE EXCEPTION 'Bookings need at least 7 days notice' USING ERRCODE = '22023'; END IF;
  IF d > current_date + 730 THEN RAISE EXCEPTION 'That date is too far ahead' USING ERRCODE = '22023'; END IF;
  SELECT * INTO pk FROM app.packages WHERE id = p->>'pkg';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown package' USING ERRCODE = '22023'; END IF;
  IF guests IS NULL OR guests > pk.cups THEN RAISE EXCEPTION 'That package serves up to % guests', pk.cups USING ERRCODE = '22023'; END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}') INTO addon_ids FROM jsonb_array_elements_text(coalesce(p->'addons','[]'::jsonb)) x;
  IF EXISTS (SELECT 1 FROM unnest(addon_ids) x WHERE x NOT IN (SELECT id FROM app.addons)) THEN
    RAISE EXCEPTION 'Unknown extra' USING ERRCODE = '22023';
  END IF;

  total := pk.price_pence;
  FOR a IN SELECT * FROM app.addons WHERE id = ANY(addon_ids) LOOP
    total := total + CASE WHEN a.per = 'guest' THEN a.price_pence * guests ELSE a.price_pence END;
  END LOOP;

  LOOP
    r := 'FR-';
    FOR i IN 1..6 LOOP r := r || substr(chars, 1 + floor(random() * length(chars))::int, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM app.bookings WHERE ref = r);
  END LOOP;

  BEGIN
    INSERT INTO app.bookings (ref, user_id, event_type, unit, event_date, start_time, guests, package_id, addons,
                              venue, postcode, contact_name, email, phone, notes, total_pence, deposit_pence)
    VALUES (r, u, p->>'event', p->>'unit', d, p->>'time', guests, pk.id, addon_ids,
            btrim(p->>'venue'), upper(btrim(p->>'postcode')), btrim(p->>'name'), lower(btrim(p->>'email')),
            btrim(p->>'phone'), left(coalesce(p->>'notes',''), 1000), total, round(total * 0.25)::int)
    RETURNING * INTO b;
  EXCEPTION
    WHEN unique_violation THEN RAISE EXCEPTION 'Sorry, that time has just been booked. Please pick another.' USING ERRCODE = '23505';
    WHEN check_violation OR not_null_violation THEN RAISE EXCEPTION 'Please check your booking details' USING ERRCODE = '22023';
  END;
  PERFORM app.ensure_member(u);
  RETURN app.booking_json(b);
END $$;

CREATE OR REPLACE FUNCTION api.my_bookings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  RETURN coalesce((SELECT jsonb_agg(app.booking_json(b) ORDER BY b.event_date)
                   FROM app.bookings b WHERE b.user_id = u AND b.status <> 'cancelled'), '[]'::jsonb);
END $$;

-- ---------- staff only ----------
CREATE OR REPLACE FUNCTION api.staff_bookings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_staff();
  RETURN coalesce((SELECT jsonb_agg(app.booking_json(b) || jsonb_build_object('phone', b.phone, 'notes', b.notes) ORDER BY b.event_date, b.start_time)
                   FROM app.bookings b WHERE b.status <> 'cancelled' AND b.event_date >= current_date - 1), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION api.staff_advance_booking(p_ref text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s text := app.require_staff(); b app.bookings;
BEGIN
  SELECT * INTO b FROM app.bookings WHERE ref = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF b.status = 'pending_deposit' THEN
    UPDATE app.bookings SET status = 'deposit_paid' WHERE id = b.id RETURNING * INTO b;
    IF NOT b.bonus_awarded THEN   -- bonus stamps only once a deposit is really paid
      PERFORM app.ensure_member(b.user_id);
      PERFORM app.add_stamps(b.user_id, 2, 'bonus', 'Booking bonus · ' || b.ref, s);
      UPDATE app.bookings SET bonus_awarded = true WHERE id = b.id RETURNING * INTO b;
    END IF;
  ELSIF b.status = 'deposit_paid' THEN
    UPDATE app.bookings SET status = 'confirmed' WHERE id = b.id RETURNING * INTO b;
  END IF;
  RETURN app.booking_json(b);
END $$;

CREATE OR REPLACE FUNCTION api.staff_find_member(p_member_no text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE m app.members;
BEGIN
  PERFORM app.require_staff();
  SELECT * INTO m FROM app.members WHERE member_no = upper(btrim(p_member_no));
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('member_no', m.member_no, 'name', coalesce(nullif(m.name,''),'Customer'), 'stamps', m.stamps, 'rewards', m.rewards);
END $$;

CREATE OR REPLACE FUNCTION api.staff_add_stamps(p_member_no text, p_n int, p_where text DEFAULT 'Trailer') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s text := app.require_staff(); m app.members; unlocked int; today int;
BEGIN
  IF p_n NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Add 1 to 6 stamps per order' USING ERRCODE = '22023'; END IF;
  SELECT * INTO m FROM app.members WHERE member_no = upper(btrim(p_member_no));
  IF NOT FOUND THEN RAISE EXCEPTION 'No member with that number' USING ERRCODE = 'P0002'; END IF;
  SELECT coalesce(sum(n),0) INTO today FROM app.stamp_events WHERE user_id = m.user_id AND kind = 'stamp' AND created_at > now() - interval '24 hours';
  IF today + p_n > 18 THEN RAISE EXCEPTION 'Daily stamp limit reached for this member' USING ERRCODE = '54000'; END IF;
  unlocked := app.add_stamps(m.user_id, p_n, 'stamp', p_where, s);
  SELECT * INTO m FROM app.members WHERE user_id = m.user_id;
  RETURN jsonb_build_object('member_no', m.member_no, 'name', coalesce(nullif(m.name,''),'Customer'), 'stamps', m.stamps, 'rewards', m.rewards, 'unlocked', unlocked);
END $$;

CREATE OR REPLACE FUNCTION api.staff_redeem(p_member_no text, p_where text DEFAULT 'Trailer') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s text := app.require_staff(); m app.members;
BEGIN
  UPDATE app.members SET rewards = rewards - 1 WHERE member_no = upper(btrim(p_member_no)) AND rewards > 0 RETURNING * INTO m;
  IF NOT FOUND THEN RAISE EXCEPTION 'This member has no free cups to redeem' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO app.stamp_events (user_id, kind, n, where_text, staff_user_id) VALUES (m.user_id, 'redeem', 0, left(p_where,120), s);
  RETURN jsonb_build_object('member_no', m.member_no, 'name', coalesce(nullif(m.name,''),'Customer'), 'stamps', m.stamps, 'rewards', m.rewards);
END $$;

CREATE OR REPLACE FUNCTION api.staff_set_live(p_live boolean, p_stop_id int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_staff();
  IF p_stop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.trailer_stops WHERE id = p_stop_id AND NOT is_private) THEN
    RAISE EXCEPTION 'Pick one of today''s public stops' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.trailer_live (id, live, stop_id, updated_at) VALUES (1, p_live, p_stop_id, now())
  ON CONFLICT (id) DO UPDATE SET live = EXCLUDED.live, stop_id = coalesce(EXCLUDED.stop_id, app.trailer_live.stop_id), updated_at = now();
  RETURN api.get_trailer();
END $$;

CREATE OR REPLACE FUNCTION api.staff_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_staff();
  RETURN jsonb_build_object(
    'stamps_today', (SELECT coalesce(sum(n),0) FROM app.stamp_events WHERE kind='stamp' AND created_at::date = current_date),
    'redeemed_today', (SELECT count(*) FROM app.stamp_events WHERE kind='redeem' AND created_at::date = current_date),
    'members', (SELECT count(*) FROM app.members));
END $$;
