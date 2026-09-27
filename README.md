# Froyo on the go app (prototype)

A clickable prototype of the Froyo on the go app for customers and staff:

- **Book**: book the indoor cart or the mobile trailer, pick a date, choose a package and pay a 25% deposit (simulated).
- **Find us**: see where the trailer is serving now and this week's public stops.
- **Rewards**: a digital stamp card (buy 9, the 10th is free) with a QR code to scan at the cart or trailer.
- **Bookings**: a customer's own bookings.
- **Operator** (staff only): bookings, trailer location sharing and the stamp till.

## This is a prototype

Nothing is saved or sent anywhere. Sign-ins, bookings, stamps and payments are simulated in the browser and reset when the page is closed. The sample customers, bookings and stops are examples. **Don't enter real passwords or personal details.**

## How it's hosted

Plain HTML, CSS and JavaScript served by GitHub Pages from the `main` branch. There's no build step, no server code, no packages and no secrets in this repository.

| File | What it is |
| --- | --- |
| `index.html` | The page, including its security policy |
| `app.css` | Styles |
| `app.js` | The app |
| `icon.png` | App and browser icon |
| `robots.txt` | Asks search engines not to list the prototype |

## Security

See [SECURITY.md](SECURITY.md) for what's in place and the repository settings to keep switched on.

© Froyo on the go. All rights reserved.
