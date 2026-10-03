-- Customers can delete their own account from the app (required by the App Store and Google Play).
--
-- What happens:
--   * sign-in account, sessions and any pending sign-in codes: deleted
--   * stamp card and stamp history: deleted
--   * staff role and any staff invite for their email: removed
--   * upcoming bookings (not cancelled): kept so the event can still go ahead, but no longer
--     linked to an account; staff still see the contact details they need for the event
--   * past or cancelled bookings: kept for the business's accounts (reference, date, amounts),
--     with name, email, phone, venue, postcode and notes removed
-- The only administrator can't delete their account (that would lock everyone out of team settings).

-- Signed-in calls now also check the account still exists, so a database pass issued
-- before deletion (valid for up to 15 minutes) stops working straight away.
CREATE OR REPLACE FUNCTION app.uid() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text;
BEGIN
  u := auth.user_id();
  IF u IS NULL OR u = '' OR NOT EXISTS (SELECT 1 FROM neon_auth."user" x WHERE x.id::text = u) THEN
    RAISE EXCEPTION 'Sign in to do this' USING ERRCODE = '42501';
  END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION app.delete_account(u text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE e text; kept int; cleared int;
BEGIN
  IF app.staff_role(u) = 'admin' AND NOT EXISTS (SELECT 1 FROM app.staff WHERE role = 'admin' AND user_id <> u) THEN
    RAISE EXCEPTION 'You’re the only administrator. Make someone else an administrator in Operator → Team first.' USING ERRCODE = '42501';
  END IF;
  SELECT lower(x.email) INTO e FROM neon_auth."user" x WHERE x.id::text = u;

  UPDATE app.bookings SET user_id = 'deleted'
   WHERE user_id = u AND status <> 'cancelled' AND event_date >= app.uk_today();
  GET DIAGNOSTICS kept = ROW_COUNT;
  UPDATE app.bookings SET user_id = 'deleted', contact_name = 'Deleted customer', email = 'deleted@invalid.invalid',
         phone = '', venue = 'Removed', postcode = 'ZZ99 9ZZ', notes = ''
   WHERE user_id = u;
  GET DIAGNOSTICS cleared = ROW_COUNT;

  DELETE FROM app.stamp_events WHERE user_id = u;
  DELETE FROM app.members WHERE user_id = u;
  DELETE FROM app.staff WHERE user_id = u;
  IF e IS NOT NULL THEN
    DELETE FROM app.staff_invites WHERE email = e;
    DELETE FROM neon_auth.verification WHERE position(e IN lower(identifier)) > 0;
  END IF;
  DELETE FROM neon_auth."user" WHERE id::text = u;   -- sessions and sign-in links go with it

  RETURN jsonb_build_object('deleted', true, 'upcoming_bookings_kept', kept, 'past_bookings_anonymised', cleared);
END $$;

CREATE OR REPLACE FUNCTION api.delete_my_account(p_confirm text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text := app.uid();
BEGIN
  IF p_confirm IS DISTINCT FROM 'DELETE' THEN
    RAISE EXCEPTION 'Please confirm to delete your account' USING ERRCODE = '22023';
  END IF;
  RETURN app.delete_account(u);
END $$;

REVOKE ALL ON FUNCTION app.delete_account(text) FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON FUNCTION api.delete_my_account(text) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION api.delete_my_account(text) TO authenticated;
