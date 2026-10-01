# Security

## Reporting a problem

Please don't open a public issue. Use **Security → Report a vulnerability** on this repository so it's reported privately.

## How customer data is protected

**In the database (Neon, London region)**
- Customer data lives in a private schema that the Data API never exposes. The website can only call a short list of checked actions (`db/02_functions.sql`).
- Every action checks who is calling. Customers can only see their own bookings and stamp card. Staff actions check the `app.staff` list, which only the database owner can change.
- Row-level security is switched on for every table, with no policies, so even a mistaken grant wouldn't expose data.
- Every action runs with a fixed, empty `search_path`, so nothing can be hijacked by another schema.
- Prices, totals and deposits are worked out by the database, never trusted from the browser.
- Limits stop abuse: up to 5 bookings a day per customer, up to 3 bookings awaiting a deposit, one booking per time slot (enforced by the database), up to 6 stamps per order and 18 per customer per day.
- Booking bonus stamps are only added when staff mark the deposit as paid.
- Every stamp and free cup records which staff member gave it and when.
- The Data API only accepts requests from https://app.froyoonthego.com (and the old GitHub address while the move finishes), returns at most 200 rows, and has its public schema listing switched off.

**Sign-in (Neon Auth)**
- Everyone, customers and staff, signs in with a one-time code sent by email. There are no passwords to guess or leak.
- The sign-in session is a secure, HttpOnly cookie that the page's code can't read.
- The short-lived database pass (15 minutes) is kept in memory only, never saved on the device.
- Sign-in is only allowed back to the trusted website address.

**On the website**
- A strict Content Security Policy lets the page run only its own code and connect only to the two Neon addresses.
- No third-party scripts, no analytics, no cookies of its own, no browser storage.
- Everything shown on screen is escaped, to prevent script injection.
- The page refuses to run inside another site's frame, and isn't listed by search engines.

## Settings the owner should keep on

**GitHub**
- Two-factor authentication on every account with access.
- Repository rules for `main`: block force pushes and deletion.
- Secret scanning, push protection and private vulnerability reporting switched on.
- Pages: **Enforce HTTPS** ticked.

**Neon console**
- Two-factor authentication on the Neon account.
- **Auth → Allow localhost: off** for production.
- **Auth → Sign-up with email and password: off.** The app only uses emailed codes.
- **Auth → Email:** use your own email sender (custom SMTP) instead of Neon's shared one before launch.
- Never share the database connection string. It isn't needed by the website and must never be put in this repository.
