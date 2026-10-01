-- Four roles: customer (no row), operator, store_admin, admin.
--   operator:    bookings list, stamp till, trailer location.
--   store_admin: + deposits/confirmations, + add/remove operators.
--   admin:       + make store admins and administrators.

ALTER TABLE app.staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE app.staff ADD CONSTRAINT staff_role_check CHECK (role IN ('operator','store_admin','admin'));
ALTER TABLE app.staff_invites DROP CONSTRAINT IF EXISTS staff_invites_role_check;
ALTER TABLE app.staff_invites ADD CONSTRAINT staff_invites_role_check CHECK (role IN ('operator','store_admin','admin'));

CREATE OR REPLACE FUNCTION app.role_rank(p_role text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_role WHEN 'admin' THEN 3 WHEN 'store_admin' THEN 2 WHEN 'operator' THEN 1 ELSE 0 END
$$;

-- Store admin or administrator.
CREATE OR REPLACE FUNCTION app.require_manager() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  IF app.role_rank(app.staff_role(u)) < 2 THEN RAISE EXCEPTION 'Store admins and administrators only' USING ERRCODE = '42501'; END IF;
  RETURN u;
END $$;

-- Who may give/take which role: admins any role; store admins only operator (or back to customer),
-- and only for people who are currently operators, customers or operator invites.
CREATE OR REPLACE FUNCTION app.can_assign(p_actor_role text, p_current text, p_new text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_actor_role = 'admin' THEN true
    WHEN p_actor_role = 'store_admin' THEN app.role_rank(p_current) <= 1 AND p_new IN ('operator','customer')
    ELSE false END
$$;

CREATE OR REPLACE FUNCTION api.staff_advance_booking(p_ref text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s text := app.require_manager(); b app.bookings;
BEGIN
  SELECT * INTO b FROM app.bookings WHERE ref = p_ref FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002'; END IF;
  IF b.status = 'pending_deposit' THEN
    UPDATE app.bookings SET status = 'deposit_paid' WHERE id = b.id RETURNING * INTO b;
    IF NOT b.bonus_awarded THEN
      PERFORM app.ensure_member(b.user_id);
      PERFORM app.add_stamps(b.user_id, 2, 'bonus', 'Booking bonus · ' || b.ref, s);
      UPDATE app.bookings SET bonus_awarded = true WHERE id = b.id RETURNING * INTO b;
    END IF;
  ELSIF b.status = 'deposit_paid' THEN
    UPDATE app.bookings SET status = 'confirmed' WHERE id = b.id RETURNING * INTO b;
  END IF;
  RETURN app.booking_json(b);
END $$;

CREATE OR REPLACE FUNCTION api.admin_team() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_manager(); myrole text := app.staff_role(me);
BEGIN
  RETURN jsonb_build_object(
    'my_role', myrole,
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object('email', lower(u.email), 'name', coalesce(nullif(u.name,''), split_part(u.email,'@',1)),
                          'role', s.role, 'note', coalesce(s.note,''), 'me', s.user_id = me,
                          'editable', s.user_id <> me AND app.can_assign(myrole, s.role, 'customer'), 'since', s.added_at)
                          ORDER BY app.role_rank(s.role) DESC, lower(u.email))
                         FROM app.staff s JOIN neon_auth."user" u ON u.id::text = s.user_id), '[]'::jsonb),
    'invites', coalesce((SELECT jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'note', coalesce(i.note,''),
                          'editable', app.can_assign(myrole, i.role, 'customer'), 'since', i.invited_at) ORDER BY i.invited_at)
                         FROM app.staff_invites i), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION api.admin_invite(p_email text, p_role text, p_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_manager(); myrole text := app.staff_role(me); e text := lower(btrim(p_email)); uid text; cur text;
BEGIN
  IF p_role NOT IN ('operator','store_admin','admin') THEN RAISE EXCEPTION 'Pick a staff role' USING ERRCODE = '22023'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(e) > 254 THEN RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023'; END IF;
  SELECT u.id::text INTO uid FROM neon_auth."user" u WHERE lower(u.email) = e AND u."emailVerified" = true;
  IF uid = me THEN RAISE EXCEPTION 'You can’t change your own role' USING ERRCODE = '42501'; END IF;
  cur := coalesce((SELECT role FROM app.staff WHERE user_id = uid), (SELECT role FROM app.staff_invites WHERE email = e), 'customer');
  IF NOT app.can_assign(myrole, cur, p_role) THEN RAISE EXCEPTION 'Only an administrator can do that' USING ERRCODE = '42501'; END IF;
  IF uid IS NOT NULL THEN
    INSERT INTO app.staff (user_id, note, role) VALUES (uid, left(p_note,80), p_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, note = coalesce(nullif(EXCLUDED.note,''), app.staff.note);
  ELSE
    INSERT INTO app.staff_invites (email, note, role) VALUES (e, left(p_note,80), p_role)
    ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, note = EXCLUDED.note, invited_at = now();
  END IF;
  RETURN api.admin_team();
END $$;

CREATE OR REPLACE FUNCTION api.admin_set_role(p_email text, p_role text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_manager(); myrole text := app.staff_role(me); e text := lower(btrim(p_email)); uid text; cur text;
BEGIN
  IF p_role NOT IN ('customer','operator','store_admin','admin') THEN RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023'; END IF;
  SELECT u.id::text INTO uid FROM neon_auth."user" u WHERE lower(u.email) = e;
  IF uid = me THEN RAISE EXCEPTION 'You can’t change your own role. Ask an administrator.' USING ERRCODE = '42501'; END IF;
  IF uid IS NOT NULL AND EXISTS (SELECT 1 FROM app.staff WHERE user_id = uid) THEN
    cur := (SELECT role FROM app.staff WHERE user_id = uid);
    IF NOT app.can_assign(myrole, cur, p_role) THEN RAISE EXCEPTION 'Only an administrator can do that' USING ERRCODE = '42501'; END IF;
    IF p_role = 'customer' THEN DELETE FROM app.staff WHERE user_id = uid;
    ELSE UPDATE app.staff SET role = p_role WHERE user_id = uid; END IF;
  ELSIF EXISTS (SELECT 1 FROM app.staff_invites WHERE email = e) THEN
    cur := (SELECT role FROM app.staff_invites WHERE email = e);
    IF NOT app.can_assign(myrole, cur, p_role) THEN RAISE EXCEPTION 'Only an administrator can do that' USING ERRCODE = '42501'; END IF;
    IF p_role = 'customer' THEN DELETE FROM app.staff_invites WHERE email = e;
    ELSE UPDATE app.staff_invites SET role = p_role WHERE email = e; END IF;
  ELSE
    RAISE EXCEPTION 'That person isn’t on the team' USING ERRCODE = 'P0002';
  END IF;
  RETURN api.admin_team();
END $$;

REVOKE ALL ON FUNCTION app.role_rank(text), app.require_manager(), app.can_assign(text, text, text) FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION api.admin_team(), api.admin_invite(text, text, text), api.admin_set_role(text, text), api.staff_advance_booking(text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.admin_team(), api.admin_invite(text, text, text), api.admin_set_role(text, text), api.staff_advance_booking(text) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- Trailer location: store admins and administrators only.
CREATE OR REPLACE FUNCTION api.staff_set_live(p_live boolean, p_stop_id int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app.require_manager();
  IF p_stop_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app.trailer_stops WHERE id = p_stop_id AND NOT is_private) THEN
    RAISE EXCEPTION 'Pick one of today''s public stops' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.trailer_live (id, live, stop_id, updated_at) VALUES (1, p_live, p_stop_id, now())
  ON CONFLICT (id) DO UPDATE SET live = EXCLUDED.live, stop_id = coalesce(EXCLUDED.stop_id, app.trailer_live.stop_id), updated_at = now();
  RETURN api.get_trailer();
END $$;
REVOKE ALL ON FUNCTION api.staff_set_live(boolean, int) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.staff_set_live(boolean, int) TO authenticated;
NOTIFY pgrst, 'reload schema';
