-- Who can call what through the Neon Data API.
-- "anonymous" = anyone visiting the site; "authenticated" = anyone signed in.
-- Staff functions are granted to "authenticated" but each one checks app.staff first.

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA api FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC, anonymous, authenticated;
REVOKE ALL ON SCHEMA app FROM anonymous, authenticated;

GRANT USAGE ON SCHEMA api TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION api.get_catalogue(), api.get_availability(text, date), api.get_trailer() TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION api.my_card(), api.update_my_card(text, text), api.create_booking(jsonb), api.my_bookings(),
  api.staff_bookings(), api.staff_advance_booking(text), api.staff_find_member(text), api.staff_add_stamps(text, int, text),
  api.staff_redeem(text, text), api.staff_set_live(boolean, int), api.staff_stats() TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA api REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
NOTIFY pgrst, 'reload schema';

-- Data API settings (set in Neon): exposed schema = api only, CORS = https://app.froyoonthego.com (+ old github.io during the move),
-- max 200 rows per response, OpenAPI listing disabled, aggregates disabled.

-- To make someone staff (run in the Neon SQL editor after they've signed in once):
--   INSERT INTO app.staff (user_id, note)
--   SELECT id::text, 'Name, role' FROM neon_auth."user" WHERE email = 'their.email@example.com';
-- To remove staff access:
--   DELETE FROM app.staff WHERE user_id = (SELECT id::text FROM neon_auth."user" WHERE email = 'their.email@example.com');
