# Froyo on the go app

The Froyo on the go web app for customers and staff, live at https://app.froyoonthego.com

- **Book**: book the indoor cart or the mobile trailer. Availability is live, and a booking holds the date until the 25% deposit is paid.
- **Find us**: where the trailer is serving now and this week's public stops.
- **Rewards**: a digital stamp card (buy 9, the 10th is free) with the customer's own QR code.
- **Bookings**: a customer's own bookings.
- **Operator** (staff only): bookings, deposits, trailer location sharing and the stamp till.

## How it works

| Part | Where it runs |
| --- | --- |
| Website (`index.html`, `app.css`, `app.js`, `qr.js`) | GitHub Pages |
| Sign-in (a one-time code by email, for customers and staff) | Neon Auth |
| Bookings, stamp cards, trailer stops | Neon Postgres, London region |

The website talks to Neon through the Neon Data API. It can only call the actions in `db/02_functions.sql`. It can't read or change any table directly.

There's no build step and there are no packages. The database set-up is in `db/` for reference.

## Making someone staff

Staff sign in the same way as customers, with a code sent to their work email. To give someone staff access:

1. They sign in once with their work email, so their account exists.
2. In the Neon console, open the **SQL Editor** for the Froyo project and run the `INSERT INTO app.staff` statement at the bottom of `db/03_grants.sql` with their email.

## Not built yet

- **Taking deposits online.** Bookings are saved as "Deposit due". Staff send a payment link and mark the deposit as paid in the Operator tab. Stripe Checkout needs a small server function to hold the secret key.
- **Adding trailer stops from the app.** For now they're added in the Neon console (Tables → `app.trailer_stops`).
- **Apple Wallet and Google Wallet passes, and nearby alerts.**

## Security

See [SECURITY.md](SECURITY.md).

© Froyo on the go. All rights reserved.
