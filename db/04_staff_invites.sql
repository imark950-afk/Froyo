-- Staff invites: add someone's email here and they become staff the first time
-- they sign in with an emailed code (which proves they own the inbox).

CREATE TABLE IF NOT EXISTS app.staff_invites (email text PRIMARY KEY CHECK (email = lower(email)), note text, invited_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE app.staff_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.staff_invites FROM PUBLIC, anonymous, authenticated;

CREATE OR REPLACE FUNCTION app.claim_staff_invite(p_uid text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE e text;
BEGIN
  -- Only a verified email (proved by the emailed sign-in code) can claim an invite.
  SELECT lower(u.email) INTO e FROM neon_auth."user" u WHERE u.id::text = p_uid AND u."emailVerified" = true;
  IF e IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM app.staff_invites WHERE email = e) THEN RETURN false; END IF;
  INSERT INTO app.staff (user_id, note) SELECT p_uid, i.note FROM app.staff_invites i WHERE i.email = e ON CONFLICT (user_id) DO NOTHING;
  DELETE FROM app.staff_invites WHERE email = e;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION app.claim_staff_invite(text) FROM PUBLIC, anonymous, authenticated;

-- api.my_card() now calls app.claim_staff_invite(u) before returning the card.

-- To invite someone as staff (Neon SQL editor):
--   INSERT INTO app.staff_invites (email, note) VALUES ('name@example.com', 'Name, role');
-- To cancel an invite:
--   DELETE FROM app.staff_invites WHERE email = 'name@example.com';
