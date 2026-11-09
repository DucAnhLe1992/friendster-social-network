# @friendster/web

The React single-page app for Friendster Modern. See the [root README](../../README.md) for setup.

## Layout

| Folder | Contents |
| --- | --- |
| `src/pages` | One file per route, lazy-loaded |
| `src/components/custom` | App components (posts, comments, dialogs, error boundary) |
| `src/components/messages` | Direct-message views |
| `src/components/ui` | The few shadcn/ui primitives in use |
| `src/context` | Realtime (Socket.io) connection and catch-up |
| `src/lib` | API client, message sync helpers |
| `src/store` | Session store (Zustand) |
| `e2e` | Playwright browser tests (`*.e2e.ts`) |

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit and component tests (Vitest, Testing Library) |
| `npm run test:e2e` | Playwright against a running app; set `E2E_BASE_URL` (default `http://localhost:5173`) |
| `npm run lint` | ESLint, including accessibility rules |
| `npm run build` | Type check and production build |

`VITE_API_URL` sets the API address at build time. Leave it unset in Docker, where nginx serves the API on the same
origin under `/api`.
