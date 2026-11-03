# Housing Portal frontend (React)

Phase 1 of the move to React (see `docs/architecture/adr-0001-java-react.md`). React 18, TypeScript (strict), Vite, React Router, TanStack Query, plain CSS.
It talks to the existing API (frozen contract, see `public/api.js` and `app.js`) through a Vite dev proxy.

## Run

```
cd frontend
npm install
npm run dev          # http://localhost:5173, /api proxied to http://localhost:3000
```

Start the Node app first (`npm start` in the repo root). To point at another backend (for example the Java one on 8080):

```
VITE_API_TARGET=http://localhost:8080 npm run dev
```

(or copy `.env.example` to `.env.local`). The proxy keeps the browser's Host header (`changeOrigin: false`) because the backend rejects state-changing calls whose `Origin` host differs from `Host`.

## Scripts

- `npm run build` type-checks (`tsc -b`) and builds to `dist/` (module scripts only, no inline scripts, CSP friendly)
- `npm run test` Vitest + React Testing Library (fetch is mocked)
- `npm run lint` ESLint (typescript-eslint, react-hooks)

## Layout

- `src/api/` typed DTOs (`types.ts`), fetch wrapper (`client.ts`, throws `ApiError` with the server's `{error}` message and `status`), and the `API` object mirroring `public/api.js` (`index.ts`). Phase 1 covers auth, profile, settings, access matrix, admin users, guards, notifications, requests/notices/passes/household reads, admin stats.
- `src/auth/` auth context (`/api/me`, login, Google, logout), route guards, lazy Google Identity Services loader.
- `src/nav.ts` role, permission and feature filtering of menu items, and the `hp.nav` preference (`{pos:'side'|'top', hidden}`; same format as the existing web app).
- `src/pages/` Login (and Join), Home (resident), Dashboard (committee), Approvals, Alerts, Settings (General, Access control, Users, Features, Guards, Sign-in).
- Phase 3: grouped navigation (`nav.ts`: Requests and safety, Community, Property, Administration; collapsible in the side layout, dropdowns in the top layout, `hp.nav` kept, `hp.navgroups` remembers collapsed sections), a responsive shell (below 700px: bottom tab bar per role, floating + for residents, Menu screen, back arrow and title on sub-pages) and the pages Emergency, Contacts, Gate pass (QR via `qrcode-generator`), Gate (guard verify with optional BarcodeDetector scan, committee overview), Gate log, Vehicles, Parking, Workers and the committee Dashboard (`GET /api/admin/overview`). API additions live in `src/api/safety.ts`.
- Other menu items not yet built show a "coming in a later phase" page.
- `public/` is copied from the existing app: logo, Outfit and Plus Jakarta Sans fonts, Phosphor duotone icon font. `src/styles/tokens.css` is `public/css/tokens.css` with a 24px card radius.

## Notes

- "Continue with Google" appears only when `GET /api/settings` returns a non-empty `google_client_id`. The script loads from accounts.google.com on click, so a production CSP must allow it (`script-src`, `frame-src`, `connect-src` for accounts.google.com).
- Design: solid-colour cards, 24px corners, bold 600 headings, no gradients or glass on cards.
