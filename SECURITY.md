# Security

## Reporting a problem

If you find a security issue, please don't open a public issue. Use **Security → Report a vulnerability** on this repository so it's reported privately.

## What the site does to protect visitors

- **Strict Content Security Policy.** The page may only run its own script (`app.js`). No inline scripts, no third-party scripts, no plugins, and `connect-src 'none'` means the page cannot send data anywhere. The only outside requests are the Google Fonts stylesheet and font files.
- **Nothing is collected.** Forms are handled in the browser and never submitted. There are no cookies, no analytics and no browser storage.
- **User input is escaped** before it's shown on the page, to prevent script injection.
- **HTTPS only**, with insecure requests upgraded.
- **No clickjacking.** The page refuses to run inside another site's frame.
- **Referrer policy** limits what other sites learn when visitors follow a link.
- **Not indexed** by search engines (`robots.txt` and `noindex`).
- **No dependencies** to go out of date. The QR code is generated ahead of time and the logo is built in.

## Repository settings to keep on

- **Two-factor authentication** on every GitHub account with access.
- **Settings → Pages:** source `main` / root, and **Enforce HTTPS** ticked.
- **Settings → Code security:** Secret scanning, Push protection, Dependabot alerts and Private vulnerability reporting switched on.
- **Settings → Branches:** a rule for `main` that blocks force pushes and deletion.
- Only give write access to people who need it.

## Before real customer data is added

When bookings, sign-ins and payments become real, they must go through a proper backend (for example Supabase with row-level security, in a UK or EU region) and a payment provider such as Stripe. Never put API secret keys, service-role keys or customer data in this repository. Only public "anon" keys belong in front-end code, protected by database access rules.
