# RideFlow

RideFlow is a full-stack ride-hailing simulation with three purpose-built dashboards (rider, driver, admin), a live operations UI, and a MySQL 8.x backend that models real-world mobility workflows end to end.

The front end is a fast, multi-role web app served by an Express API. The backend enforces business rules, pricing logic, and operational governance with procedures, triggers, and reporting views that mirror how a production platform would run.

---

## Highlights

- Three distinct dashboards (rider, driver, admin) that feel like real product surfaces.
- Pricing engine with surge, promo logic, and wallet-aware validation.
- Live dashboards with automatic refresh and operations reporting.
- End-to-end ride lifecycle with verification, acceptance, and completion flows.
- Wallet + payments ledger with commission tracking and auditability.
- Database logic (procedures, triggers, views) designed to reflect platform-grade behavior.

---

## Why It Feels Real

- **Role-first UX**: each dashboard has its own navigation, metrics, and workflows.
- **Operational rigor**: verification, flags, and reporting are built into the data model.
- **Data integrity**: constraints, checks, and triggers prevent invalid state.
- **Fresh-start ready**: the project boots with a clean database state, an admin account, and the location graph needed for new signups and operations.

---

## Tech Stack

- Node.js + Express (API server)
- MySQL 8.x (schema, procedures, triggers, views)
- Vanilla JS + HTML + CSS (front end)

---

## Live Demo

The current deployed demo is available on Railway:

- Rider app: [https://rideflow.up.railway.app/](https://rideflow.up.railway.app/)
- Driver app: [https://rideflow.up.railway.app/driver/](https://rideflow.up.railway.app/driver/)
- Admin app: [https://rideflow.up.railway.app/admin/](https://rideflow.up.railway.app/admin/)

Use the admin credentials listed below to configure the platform, then create rider and driver accounts through the signup flows.

---

## Data Model

The database design is summarized in the ER diagram:

- [Entity Relationship Diagram.pdf](./Entity%20Relationship%20Diagram.pdf)

This diagram shows the relationships between users, drivers, vehicles, rides, locations, payments, wallets, ratings, and reporting-support tables.

---

## Project Structure

```
.
├── server.js
├── package.json
├── public/
│   ├── index.html
│   ├── admin/index.html
│   ├── driver/index.html
│   ├── app.js
│   ├── styles.css
│   ├── js/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── admin.js
│   │   ├── admin/
│   │   │   ├── index.js
│   │   │   ├── reports.js
│   │   │   ├── users.js
│   │   │   ├── drivers.js
│   │   │   ├── vehicles.js
│   │   │   ├── fareRules.js
│   │   │   └── shared.js
│   │   ├── driver.js
│   │   ├── driver/
│   │   │   ├── index.js
│   │   │   ├── requests.js
│   │   │   ├── trips.js
│   │   │   └── earnings.js
│   │   ├── rider.js
│   │   ├── rider/
│   │   │   ├── index.js
│   │   │   ├── booking.js
│   │   │   ├── history.js
│   │   │   └── wallet.js
│   │   ├── shell.js
│   │   ├── site.js
│   │   ├── state.js
│   │   ├── ui.js
│   │   └── device.js
├── schema.sql
├── logic.sql
├── bootstrap.sql
├── security.sql
├── checks.sql
└── queries.sql
```

---

## Repository Guide

### Root Files

- `server.js`  
  Main Express server, API routes, session handling, role checks, static site serving, and MySQL connection setup.

- `package.json`  
  Project metadata, runtime dependencies, and npm scripts.

- `package-lock.json`  
  Locked dependency tree for reproducible installs.

- `.env.example`  
  Example environment configuration for local, cloud, and Railway-style deployment.

- `README.md`  
  Primary project guide, architecture summary, setup instructions, and deployment notes.

- `RUN_INSTRUCTIONS.txt`  
  Plain-text setup and testing instructions for quick handoff to teammates.

- `Entity Relationship Diagram.pdf`  
  Visual ER diagram of the RideFlow database schema.

### Database SQL Files

- `schema.sql`  
  Creates the full relational schema, tables, keys, constraints, and base structure.

- `logic.sql`  
  Adds stored procedures, views, triggers, and event logic for pricing, automation, and business rules.

- `bootstrap.sql`  
  Loads the admin account and the reference location graph required for rider and driver flows without adding sample operational data.

- `security.sql`  
  Defines MySQL roles and grants for database-side access control.

- `checks.sql`  
  Verification queries used to confirm setup, counts, and rubric-related database behavior.

- `queries.sql`  
  Reporting and rubric-style SQL queries for demonstrations and academic evaluation.

### Scripts

- `scripts/init-db.js`  
  Applies the SQL setup files programmatically against the configured database, useful for Aiven and Railway-connected deployments.

### Frontend Entry Files

- `public/index.html`  
  Rider-facing entry page.

- `public/driver/index.html`  
  Driver-facing entry page.

- `public/admin/index.html`  
  Admin-facing entry page.

- `public/app.js`  
  Frontend bootstrap that initializes device mode, page context, and auth boot flow.

- `public/styles.css`  
  Shared styling for desktop, mobile, role dashboards, and branded UI components.

### Frontend Shared Modules

- `public/js/api.js`  
  Fetch wrapper for backend calls and session-token handling.

- `public/js/auth.js`  
  Login, signup, logout, and boot-time authentication flow.

- `public/js/device.js`  
  Mobile and touch detection helpers.

- `public/js/shell.js`  
  Shared application shell rendering, navigation, refresh logic, and live-update orchestration.

- `public/js/site.js`  
  Hostname/path audience detection for rider, driver, and admin experiences.

- `public/js/state.js`  
  Shared client-side application state.

- `public/js/ui.js`  
  Formatting helpers, toasts, tables, loading helpers, and small UI utilities.

### Role-Level Frontend Modules

- `public/js/rider.js`  
  Rider dashboard entry renderer.

- `public/js/driver.js`  
  Driver dashboard entry renderer.

- `public/js/admin.js`  
  Admin dashboard entry renderer.

### Rider Feature Modules

- `public/js/rider/index.js`  
  Rider module barrel/export entry.

- `public/js/rider/booking.js`  
  Ride booking UI, city/location flow, fare estimation, and current ride state.

- `public/js/rider/history.js`  
  Ride history rendering and driver rating flow.

- `public/js/rider/wallet.js`  
  Wallet balance, top-ups, and transaction history.

### Driver Feature Modules

- `public/js/driver/index.js`  
  Driver module barrel/export entry.

- `public/js/driver/requests.js`  
  Incoming ride offers, work area, and request actions.

- `public/js/driver/trips.js`  
  Active trip progression and trip history.

- `public/js/driver/earnings.js`  
  Earnings summaries and payout-oriented views.

### Admin Feature Modules

- `public/js/admin/index.js`  
  Admin module barrel/export entry.

- `public/js/admin/reports.js`  
  Platform metrics, charts, and reporting views.

- `public/js/admin/users.js`  
  User management and status actions.

- `public/js/admin/drivers.js`  
  Driver verification and admin controls.

- `public/js/admin/vehicles.js`  
  Vehicle verification and review controls.

- `public/js/admin/fareRules.js`  
  Fare configuration, city rules, and pricing updates.

- `public/js/admin/shared.js`  
  Shared helpers used across admin feature screens.

### Frontend Assets

- `public/assets/rideflow-mark.svg`  
  RideFlow brand mark.

- `public/assets/rideflow-route-art.svg`  
  Hero and route-themed illustration used in auth and booking UI.

- `public/assets/vehicle-economy.svg`, `vehicle-premium.svg`, `vehicle-bike.svg`  
  Vehicle type illustrations.

- `public/assets/driver-trust.svg`  
  Driver/trust visual used in driver-facing surfaces.

- `public/assets/admin-analytics.svg`  
  Admin analytics illustration.

- `public/assets/empty-rides.svg`  
  Empty-state illustration for ride-related screens.

---

## Quick Start

1) Install dependencies

```
npm install
```

2) Create and bootstrap the database (MySQL 8.x)

Run in this order (local MySQL or Aiven):

```
-- schema first
schema.sql

-- procedures, views, triggers
logic.sql

-- admin account and location reference data
bootstrap.sql

-- optional: roles and users
security.sql

-- optional: verification queries
checks.sql

-- optional: rubric / report queries
queries.sql
```

3) Configure environment

Create a `.env` file (or use `.env.example`) with your settings:

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=rideflow_db
DB_SSL_CA_CONTENT=
SESSION_TTL_MS=28800000
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

For managed cloud MySQL providers like Aiven, prefer `DB_SSL_CA_CONTENT` with the certificate contents. For local file-based setups you can still use `DB_SSL_CA=ca.pem`.

4) Run the server

```
npm run dev
```

Open the app:

- Rider: http://localhost:3000/
- Driver: http://localhost:3000/driver/
- Admin: http://localhost:3000/admin/

---

## Aiven (Cloud MySQL) Setup

1) Create a MySQL service in Aiven and create a database named `rideflow_db`.
2) Copy the CA certificate contents from Aiven.
3) Update `.env` with your Aiven connection values:

```
DB_HOST=your-aiven-host
DB_PORT=your-aiven-port
DB_USER=your-aiven-user
DB_PASSWORD=your-aiven-password
DB_NAME=rideflow_db
DB_SSL_CA_CONTENT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

4) Initialize the cloud database with the bundled script:

```
npm run db:init
```

This runs `schema.sql`, `logic.sql`, and `bootstrap.sql` against the configured DB.

---

## Railway Deployment

This project deploys cleanly on Railway as a single Node service connected to Aiven MySQL.

### Recommended Railway variables

Add the following variables in your Railway web service:

```env
DB_HOST=your-aiven-host
DB_PORT=your-aiven-port
DB_USER=your-aiven-user
DB_PASSWORD=your-aiven-password
DB_NAME=rideflow_db
DB_SSL_CA_CONTENT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
CORS_ORIGINS=https://your-service.up.railway.app
SESSION_TTL_MS=28800000
```

Notes:

- Do not set `PORT` manually on Railway. Railway injects it automatically.
- `DB_SSL_CA_CONTENT` is preferred over `DB_SSL_CA=ca.pem` for cloud deploys because it avoids committing or mounting a certificate file.
- If you keep the single Railway public domain setup, the role-specific entry points remain:
  - Rider: `https://your-service.up.railway.app/`
  - Driver: `https://your-service.up.railway.app/driver/`
  - Admin: `https://your-service.up.railway.app/admin/`

### Initializing the deployed database

After configuring the Railway or Aiven credentials locally in `.env`, run:

```bash
npm run db:init
```

This loads the schema, procedures, baseline bootstrap data, and security setup into the configured database.

---

## Admin Access

The bootstrap data keeps only the admin account by default:

- Admin: `admin@rideflow.test` / `admin123`

Create rider and driver accounts through the public signup flows after deployment or local startup.
Before riders can book trips, configure fare rules from the admin panel for each city and vehicle type you want to support.

---

## How It Works

### Role-based UI
The UI is a single app shell that adapts by audience:

- Rider: booking, fare estimate, ride history, wallet
- Driver: availability, requests, active trips, earnings
- Admin: metrics, user and driver verification, fare rules, reporting

Audience is inferred by hostname, path, or the `rideflow-audience` meta tag. Local paths `/`, `/driver`, and `/admin` are supported.

Role UI logic is modularized by section. The entry files (`admin.js`, `driver.js`, `rider.js`) re-export role renderers from their respective folders, and each section (like booking, trips, reports) lives in its own module for easier maintenance.

### Mobile and touch support
There is no separate mobile app. The same UI adapts for touch and smaller screens using responsive CSS breakpoints and runtime device detection (`device.js`) that adds `is-mobile` and `is-touch` classes to the document.

### Session Auth
- Login returns a session token.
- The frontend sends `X-Session-Token` on API calls.
- Sessions are stored in memory with a sliding TTL (`SESSION_TTL_MS`).

### Pricing
Fare estimates and final fares are calculated by `sp_calculate_fare`, which applies:

- Base + per km + per min
- Surge multiplier
- Optional promo discount

### Ride Lifecycle
Rides move through:

`requested` -> `accepted` -> `driver_en_route` -> `in_progress` -> `completed`

Riders can cancel before completion. Drivers can accept/reject requests. Completed rides generate payment records and wallet updates when applicable.

---

## API Overview

High-level endpoints (see `server.js` for full details):

- Health: `GET /api/health`
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Rider: `GET /api/rider/dashboard`, `POST /api/rider/rides`, `POST /api/rider/fares/estimate`
- Driver: `GET /api/driver/dashboard`, `PATCH /api/driver/availability`, `PATCH /api/driver/location`
- Admin: `GET /api/admin/dashboard`, `PATCH /api/admin/users/:userId/status`, `PATCH /api/admin/drivers/:driverId`, `PATCH /api/admin/vehicles/:vehicleId`

---

## Database Notes

- `schema.sql` defines core entities (users, drivers, vehicles, rides, payments, ratings, wallets, and locations).
- `logic.sql` adds procedures, views, triggers, and admin notification automation.
- `bootstrap.sql` loads the admin account and the city/location reference graph used by the app.
- `security.sql` provides roles and sample DB users for role-based access.
- `checks.sql` and `queries.sql` are validation and reporting scripts.

---

## Troubleshooting

- **Cannot connect to MySQL**: verify credentials in `.env` and confirm the database exists.
- **CORS errors**: add your origin to `CORS_ORIGINS`.
- **Empty dashboards**: create rider and driver accounts, then configure fare rules from the admin panel.
- **Login fails**: check that the account is `active` and that the selected dashboard matches the user role.

---

## Scripts

```
npm run dev
npm start
npm run db:init
```

`npm run dev` and `npm start` start the same server entrypoint (`server.js`).

---

## License

This project is a coursework-style demo. Add a license if you plan to publish it.
