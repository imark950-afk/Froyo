-- "Coming soon" lock: while it's on, only staff and people on the early access list
-- can use the app. Everyone else sees a Coming soon screen, and the database refuses
-- their requests (trailer location, availability, prices, bookings, stamp card).
--   * administrators switch the lock on or off (Operator → Team → Early access)
--   * store admins and administrators add or remove early access emails

CREATE TABLE IF NOT EXISTS app.site (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  prelaunch boolean NOT NULL DEFAULT true,
  updated_by text, updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO app.site (id, prelaunch) VALUES (1, true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app.testers (
  email text PRIMARY KEY CHECK (email = lower(email) AND char_length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 80),
  added_by text, added_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE app.site ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.testers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.site, app.testers FROM PUBLIC, anonymous, authenticated;

-- Can the caller use the app right now?
CREATE OR REPLACE FUNCTION app.has_access() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := auth.user_id(); e text;
BEGIN
  IF NOT coalesce((SELECT prelaunch FROM app.site WHERE id = 1), false) THEN RETURN true; END IF;
  IF u IS NULL OR u = '' THEN RETURN false; END IF;
  IF app.staff_role(u) IS NOT NULL THEN RETURN true; END IF;
  SELECT lower(x.email) INTO e FROM neon_auth."user" x WHERE x.id::text = u AND x."emailVerified";
  RETURN e IS NOT NULL AND (EXISTS (SELECT 1 FROM app.testers WHERE email = e)
                            OR EXISTS (SELECT 1 FROM app.staff_invites WHERE email = e));
END $$;

CREATE OR REPLACE FUNCTION app.check_access() RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT app.has_access() THEN RAISE EXCEPTION 'COMING_SOON' USING ERRCODE = '42501'; END IF;
  RETURN true;
END $$;

-- Public: is the lock on, and can this caller get in?
CREATE OR REPLACE FUNCTION api.site_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('prelaunch', coalesce((SELECT prelaunch FROM app.site WHERE id = 1), false), 'access', app.has_access())
$$;

-- Customer-facing functions now check access first.
CREATE OR REPLACE FUNCTION api.get_catalogue() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.check_access();
  SELECT jsonb_build_object(
    'packages', (SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'cups',cups,'price',price_pence) ORDER BY sort) FROM app.packages),
    'addons',   (SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'per',per,'price',price_pence) ORDER BY sort) FROM app.addons),
    'min_date', current_date + 7)
$$;

-- get_trailer is also used inside the staff trailer screens; staff always pass the check.
CREATE OR REPLACE FUNCTION api.get_trailer() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app.check_access();
  SELECT jsonb_build_object(
    'live', coalesce(l.live AND ls.stop_date = app.uk_today(), false),
    'now_id', CASE WHEN l.live AND ls.stop_date = app.uk_today() THEN l.stop_id END,
    'updated', l.updated_at,
    'stops', coalesce((SELECT jsonb_agg(app.stop_json(s, false) ORDER BY s.stop_date, s.time_from)
      FROM app.trailer_stops s WHERE s.stop_date BETWEEN app.uk_today() AND app.uk_today() + 6), '[]'::jsonb))
  FROM (SELECT 1) one LEFT JOIN app.trailer_live l ON l.id = 1 LEFT JOIN app.trailer_stops ls ON ls.id = l.stop_id
$$;

-- my_card tells the app whether the person has access, and doesn't create a stamp card when they don't.
CREATE OR REPLACE FUNCTION api.my_card() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid(); r text;
BEGIN
  PERFORM app.claim_staff_invite(u);
  r := app.staff_role(u);
  IF NOT app.has_access() THEN
    RETURN jsonb_build_object('access', false, 'staff', false, 'role', 'customer');
  END IF;
  PERFORM app.ensure_member(u);
  RETURN app.card_json(u) || jsonb_build_object('access', true, 'staff', r IS NOT NULL, 'role', coalesce(r, 'customer'));
END $$;

-- The other customer functions: add the access check as their first step.
DO $$
DECLARE f text; def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['api.get_availability(text,date)','api.create_booking(jsonb)','api.my_bookings()','api.update_my_card(text,text)'] LOOP
    def := pg_get_functiondef(f::regprocedure);
    IF position('app.check_access()' IN def) = 0 THEN
      EXECUTE regexp_replace(def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM app.check_access();\n');
    END IF;
  END LOOP;
END $$;

-- Team screen: the lock and the early access list.
CREATE OR REPLACE FUNCTION api.admin_prelaunch() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  RETURN jsonb_build_object(
    'prelaunch', coalesce((SELECT prelaunch FROM app.site WHERE id = 1), false),
    'can_switch', app.staff_role(app.uid()) = 'admin',
    'testers', coalesce((SELECT jsonb_agg(jsonb_build_object('email', t.email, 'note', t.note,
                 'joined', EXISTS (SELECT 1 FROM neon_auth."user" x WHERE lower(x.email) = t.email)) ORDER BY t.added_at)
               FROM app.testers t), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION api.admin_set_prelaunch(p_on boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.uid();
BEGIN
  IF app.staff_role(me) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only an administrator can do that' USING ERRCODE = '42501'; END IF;
  IF p_on IS NULL THEN RAISE EXCEPTION 'Pick on or off' USING ERRCODE = '22023'; END IF;
  INSERT INTO app.site (id, prelaunch, updated_by, updated_at) VALUES (1, p_on, me, now())
  ON CONFLICT (id) DO UPDATE SET prelaunch = EXCLUDED.prelaunch, updated_by = me, updated_at = now();
  RETURN api.admin_prelaunch();
END $$;

CREATE OR REPLACE FUNCTION api.admin_add_tester(p_email text, p_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_manager(); e text := lower(btrim(coalesce(p_email,'')));
BEGIN
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(e) > 254 THEN RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM app.testers) >= 500 THEN RAISE EXCEPTION 'The early access list is full' USING ERRCODE = '54000'; END IF;
  INSERT INTO app.testers (email, note, added_by) VALUES (e, left(btrim(coalesce(p_note,'')), 80), me)
  ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note;
  RETURN api.admin_prelaunch();
END $$;

CREATE OR REPLACE FUNCTION api.admin_remove_tester(p_email text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  DELETE FROM app.testers WHERE email = lower(btrim(coalesce(p_email,'')));
  RETURN api.admin_prelaunch();
END $$;

REVOKE ALL ON FUNCTION app.has_access(), app.check_access() FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION api.admin_prelaunch(), api.admin_set_prelaunch(boolean), api.admin_add_tester(text, text), api.admin_remove_tester(text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.admin_prelaunch(), api.admin_set_prelaunch(boolean), api.admin_add_tester(text, text), api.admin_remove_tester(text) TO authenticated;
REVOKE ALL ON FUNCTION api.site_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.site_status(), api.get_catalogue(), api.get_trailer() TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION api.my_card() TO authenticated;
