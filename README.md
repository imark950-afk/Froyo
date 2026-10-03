# Froyo on the go app

The Froyo on the go web app for customers and staff, live at https://app.froyoonthego.com

- **Book**: book the indoor cart or the mobile trailer. Availability is live, and a booking holds the date until the 25% deposit is paid.
- **Find us**: where the trailer is serving now and this week's public stops.
- **Rewards**: a digital stamp card (buy 9, the 10th is free) with the customer's own QR code.
- **Bookings**: a customer's own bookings.
- **Operator** (staff only): bookings, deposits, trailer location sharing, booking availability, the stamp till and team roles.
- **Account**: anyone signed in can delete their own account from the account menu (`db/09_delete_account.sql`). Upcoming bookings are kept for the event; past bookings are anonymised.
- **Privacy policy**: `privacy.html`, at https://app.froyoonthego.com/privacy.html (needed for the App Store and Google Play).
- **Coming soon lock** (`db/10_prelaunch.sql`): while it's on, only staff and people on the early access list can use the app; everyone else sees a Coming soon screen and the database refuses their requests. Administrators switch it in Operator → Team → Early access; store admins and administrators manage the list.
- **Installable**: `manifest.webmanifest`, icons and `sw.js` (an offline helper that only caches the app's own files) let people add the app to their home screen.

## How it works

| Part | Where it runs |
| --- | --- |
| Website (`index.html`, `app.css`, `app.js`, `qr.js`) | GitHub Pages |
| Sign-in (a one-time code by email, for customers and staff) | Neon Auth, through a relay at auth.froyoonthego.com (`relay/`, a Neon Function in the `froyo-auth-relay` project) |
| Bookings, stamp cards, trailer stops | Neon Postgres, London region |

The website talks to Neon through the Neon Data API. It can only call the actions in `db/02_functions.sql`. It can't read or change any table directly.

There's no build step and there are no packages. The database set-up is in `db/` for reference.

## Roles

| | Customer | Operator | Store admin | Administrator |
| --- | --- | --- | --- | --- |
| Book, own bookings, own stamp card | ✓ | ✓ | ✓ | ✓ |
| Operator tab: bookings list, stamp till | | ✓ | ✓ | ✓ |
| Mark deposits paid, confirm bookings | | | ✓ | ✓ |
| Trailer: set where it's serving now, add/edit/delete stops | | | ✓ | ✓ |
| Availability: block start times between dates (cart, trailer or both) | | | ✓ | ✓ |
| Add and remove operators | | | ✓ | ✓ |
| Make store admins and administrators | | | | ✓ |

Everyone who signs in is a customer. To change someone's role, a store admin or administrator opens **Operator → Team** in the app: pick a role from the menu next to their name, or add a new person by email. If they haven't signed in yet, the role waits for them until they sign in with that email. Nobody can change their own role.

The rules are enforced by the database (`db/05_roles.sql`, `db/06_store_admin.sql`), not just hidden in the app.

## Changing the database

After adding or changing a function in `db/`, refresh the Data API so the app can see it: in the Neon console open **Data API → Settings** and click **Save** (or run `neon data-api refresh-schema --database neondb`). Until then the app shows "Could not find the function … in the schema cache".

## Not built yet

- **High-resolution icons.** The app icons are enlarged from the 240px logo; replace `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `apple-touch-icon.png` once a larger logo is available.

- **Taking deposits online.** Bookings are saved as "Deposit due". Staff send a payment link and mark the deposit as paid in the Operator tab. Stripe Checkout needs a small server function to hold the secret key.
- **Apple Wallet and Google Wallet passes, and nearby alerts.**

## Security

See [SECURITY.md](SECURITY.md).

© Froyo on the go. All rights reserved.
