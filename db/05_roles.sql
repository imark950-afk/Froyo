-- Three roles: customer (everyone, no row needed), operator and admin (rows in app.staff).
--   operator: Operator tab, bookings list, stamp till, trailer location.
--   admin:    everything an operator can do, plus deposits/confirmations and managing the team.

ALTER TABLE app.staff ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'operator' CHECK (role IN ('operator','admin'));
ALTER TABLE app.staff_invites ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'operator' CHECK (role IN ('operator','admin'));
UPDATE app.staff SET role = 'admin' WHERE note = 'Admin (owner)';

CREATE OR REPLACE FUNCTION app.staff_role(p_uid text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM app.staff WHERE user_id = p_uid
$$;

-- Any staff role (operator or admin).
CREATE OR REPLACE FUNCTION app.require_staff() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  IF app.staff_role(u) IS NULL THEN RAISE EXCEPTION 'Staff only' USING ERRCODE = '42501'; END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION app.require_admin() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  IF app.staff_role(u) IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Administrators only' USING ERRCODE = '42501'; END IF;
  RETURN u;
END $$;

-- Invites now carry a role.
CREATE OR REPLACE FUNCTION app.claim_staff_invite(p_uid text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE e text;
BEGIN
  SELECT lower(u.email) INTO e FROM neon_auth."user" u WHERE u.id::text = p_uid AND u."emailVerified" = true;
  IF e IS NULL OR NOT EXISTS (SELECT 1 FROM app.staff_invites WHERE email = e) THEN RETURN false; END IF;
  INSERT INTO app.staff (user_id, note, role) SELECT p_uid, i.note, i.role FROM app.staff_invites i WHERE i.email = e
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  DELETE FROM app.staff_invites WHERE email = e;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION api.my_card() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid(); r text;
BEGIN
  PERFORM app.claim_staff_invite(u);
  PERFORM app.ensure_member(u);
  r := app.staff_role(u);
  RETURN app.card_json(u) || jsonb_build_object('staff', r IS NOT NULL, 'role', coalesce(r, 'customer'));
END $$;

-- Money and confirmations: admins only.
CREATE OR REPLACE FUNCTION api.staff_advance_booking(p_ref text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s text := app.require_admin(); b app.bookings;
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

-- ---------- Team management (admins only) ----------
CREATE OR REPLACE FUNCTION api.admin_team() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_admin();
BEGIN
  RETURN jsonb_build_object(
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object('email', lower(u.email), 'name', coalesce(nullif(u.name,''), split_part(u.email,'@',1)),
                          'role', s.role, 'note', coalesce(s.note,''), 'me', s.user_id = me, 'since', s.added_at) ORDER BY s.role, lower(u.email))
                         FROM app.staff s JOIN neon_auth."user" u ON u.id::text = s.user_id), '[]'::jsonb),
    'invites', coalesce((SELECT jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'note', coalesce(i.note,''), 'since', i.invited_at) ORDER BY i.invited_at)
                         FROM app.staff_invites i), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION api.admin_invite(p_email text, p_role text, p_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE me text := app.require_admin(); e text := lower(btrim(p_email)); uid text;
BEGIN
  IF p_role NOT IN ('operator','admin') THEN RAISE EXCEPTION 'Pick operator or administrator' USING ERRCODE = '22023'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR char_length(e) > 254 THEN RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023'; END IF;
  -- Already has a verified account: give them the role straight away.
  SELECT u.id::text INTO uid FROM neon_auth."user" u WHERE lower(u.email) = e AND u."emailVerified" = true;
  IF uid IS NOT NULL THEN
    IF uid = me THEN RAISE EXCEPTION 'You can’t change your own role' USING ERRCODE = '42501'; END IF;
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
DECLARE me text := app.require_admin(); e text := lower(btrim(p_email)); uid text;
BEGIN
  IF p_role NOT IN ('customer','operator','admin') THEN RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023'; END IF;
  SELECT u.id::text INTO uid FROM neon_auth."user" u WHERE lower(u.email) = e;
  IF uid = me THEN RAISE EXCEPTION 'You can’t change your own role. Ask another administrator.' USING ERRCODE = '42501'; END IF;
  IF uid IS NOT NULL AND EXISTS (SELECT 1 FROM app.staff WHERE user_id = uid) THEN
    IF p_role = 'customer' THEN DELETE FROM app.staff WHERE user_id = uid;
    ELSE UPDATE app.staff SET role = p_role WHERE user_id = uid; END IF;
  ELSIF EXISTS (SELECT 1 FROM app.staff_invites WHERE email = e) THEN
    IF p_role = 'customer' THEN DELETE FROM app.staff_invites WHERE email = e;
    ELSE UPDATE app.staff_invites SET role = p_role WHERE email = e; END IF;
  ELSE
    RAISE EXCEPTION 'That person isn’t on the team' USING ERRCODE = 'P0002';
  END IF;
  RETURN api.admin_team();
END $$;

-- Grants: team functions callable when signed in; each checks for admin itself.
REVOKE ALL ON FUNCTION app.staff_role(text), app.require_admin() FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION api.admin_team(), api.admin_invite(text, text, text), api.admin_set_role(text, text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.admin_team(), api.admin_invite(text, text, text), api.admin_set_role(text, text) TO authenticated;
REVOKE ALL ON FUNCTION api.my_card(), api.staff_advance_booking(text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.my_card(), api.staff_advance_booking(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
