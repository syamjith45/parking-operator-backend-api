# Parking Operator Backend API — Project Overview

## Summary

This repository implements the backend API for a parking operator platform. It provides a GraphQL API for logging vehicle entries/exits, calculating fees (including overstay charges), managing pricing and spaces, handling organizations and staff roles, and collecting payments. The server is built with Node.js and Apollo Server, and uses Redis and a SQL database (DB access in src/config/database.js) for persistence and caching.

## Key Features

- GraphQL API for vehicle entry/exit flows and admin operations
- Pricing rules, slabs and overstay charge calculation
- Multi-organization and multi-space support
- Staff roles and operator management
- Payment and transaction records with overstay collection
- Dashboard and revenue reporting endpoints

## Tech Stack

- Node.js
- Apollo Server (GraphQL)
- Redis (cache/session helpers) — see src/config/redis.js
- Relational DB (configured in src/config/database.js)
- Docker / docker-compose for local setups

## Repository Layout (important files)

- `server.js` — application entry and Apollo Server setup (src/server.js)
- `src/graphql/schema.js` — GraphQL type definitions and schema
- `src/graphql/resolvers` — resolver implementations (index.js, mutations.js, queries.js)
- `src/config/database.js` — DB configuration and connection
- `src/config/redis.js` — Redis client/config
- `src/services/` — core business logic (cacheService, entryService, exitService, etc.)
- `src/middleware/auth.js` — authentication middleware
- `src/utils/` — helpers (calculations, date helpers, validators)
- root scripts: `check-db-migration.js`, `quick-db-check.js`, `seed-api.js`, and various verification scripts used during development

Refer to `src/graphql/schema.js` for a comprehensive list of types, queries, and mutations.

## GraphQL Highlights

- Entry mutation: `logVehicleEntry(input: VehicleEntryInput!)` returns `VehicleEntryResult` with fees and used pricing info.
- Exit mutation: `processVehicleExit(session_id: String!)` returns `ExitResult` including overstay record and totals.
- Queries for dashboards, transaction history, organizations, spaces, pricing, and overstay slabs.

## API Surface

Below is a concise list of the GraphQL queries and mutations implemented by the API (see `src/graphql/schema.js` for full details and types).

- Queries
	- `activeVehicles`: [Vehicle]! — list currently active sessions
	- `getVehicleBySession(session_id: String!)`: Vehicle — fetch session by session id
	- `dashboardStats(period, start_date, end_date)`: DashboardStats! — dashboard metrics
	- `pricingRules`, `getPricingRule(vehicle_type)`, `pricingTypes`, `vehicleTypes` — pricing-related lookups
	- `revenueSummary(start_date, end_date)`: RevenueSummary! — revenue by period
	- `pendingOverstayCharges`: [OverstayCharge]! — unpaid overstay records
	- `paymentMethods`, `paymentMethod(code)` — supported payment methods
	- `staff(id)`, `me`, `myProfile` — staff and profile endpoints
	- `transactionHistory(...)`: TransactionHistoryResult! — paginated transaction listing with filters
	- `organization(id)`, `organizations`, `myOrganization`, `orgStats(id)`, `adminGlobalStats(...)` — organization-level queries
	- `overstaySlabs(organization_id, vehicle_type)`: [OverstaySlab]! — configured overstay slabs
	- `spaces(organization_id)`, `mySpaces`, `space(id)`, `spaceOperators(space_id)`, `organizationOperators(organization_id)`, `reassignmentBlockers(staff_id)` — space and operator management

- Mutations
	- `logVehicleEntry(input: VehicleEntryInput!)`: VehicleEntryResult! — record new vehicle entry and compute base fee
	- `processVehicleExit(session_id: String!)`: ExitResult! — finalize exit, calculate overstay and totals
	- `collectOverstayPayment(overstay_charge_id, payment_method_code)`: OverstayCharge! — record overstay payment
	- `updatePricingRules(rules: [PricingRuleInput!]!)`: [PricingRule]! — bulk pricing updates
	- Organization management: `createOrganization`, `updateOrganization`, `deactivateOrganization`, `setOrganizationPricingType`
	- Overstay slab management: `createOverstaySlab`, `updateOverstaySlab`, `deleteOverstaySlab`
	- Space/operator management: `createSpace`, `updateSpace`, `createOperator`, `assignOperatorToSpace`, `reassignOperator`

Note: each operation's input/output types (for example `VehicleEntryInput`, `ExitResult`, and `VehicleEntryResult`) are defined in `src/graphql/schema.js`.

## Configuration & Environment

Environment variables expected (check `src/config/*.js` to confirm exact names):

- `DATABASE_URL` or DB host/port/user/pass variables
- `REDIS_URL` or host/port for Redis
- `PORT` — server port (default often 4000 or 3000)
- `NODE_ENV` — environment

Local development usually requires a running database and Redis instance. The repository includes `docker-compose.yml` to start required services locally.

## Running Locally (common commands)

Install dependencies:

```
npm install
```

Start in development:

```
npm run start
```

Or using Docker Compose:

```
docker-compose up --build
```

Useful helper scripts (root):

- `node quick-db-check.js` — quick DB connectivity check
- `node check-db-migration.js` — check migrations
- `node seed-api.js` — seed sample data (if available)

## Testing

Check `test-*.js` files at repository root for available test scripts (e.g., `test-db-connection.js`, `test-graphql-endpoints.js`). Run them with Node or via npm scripts if defined in `package.json`.

## Development Notes & Conventions

- Business logic lives in `src/services/*`. Keep GraphQL resolvers thin and delegate to services.
- Use `src/utils/calculations.js` for fee calculation helpers to keep rules centralized.
- Redis is used for caching and short-lived session state — be mindful of cache invalidation around exit processing.
- When adding new types or mutations, update both `src/graphql/schema.js` and the corresponding resolver in `src/graphql/resolvers/`.

## Docker & Deployment

The project includes a `Dockerfile` and `docker-compose.yml`. For production deployment:

- Build the image: `docker build -t parking-operator-backend .`
- Run with env vars set or use an orchestrator (Kubernetes, ECS) for multi-service deployments.

## Contributing

- Fork and open pull requests for changes.
- Add tests for new logic, especially pricing and overstay calculations.
- Follow existing code patterns: services for business logic, resolvers only for wiring input/output.

## Where to Look First as a New Developer

1. `src/server.js` — app startup and middleware
2. `src/graphql/schema.js` — API contract
3. `src/graphql/resolvers/index.js` and `src/services/entryService.js` / `exitService.js` — core entry/exit flows

## Backend Architecture

This section describes the backend's major components, data flow for entry/exit, and operational considerations.

- **API Layer (GraphQL / Apollo)**: `src/server.js` boots Apollo Server and attaches middleware. The GraphQL schema lives in `src/graphql/schema.js` and resolvers in `src/graphql/resolvers/`. Resolvers should be thin: validate input, enforce auth/roles, then delegate to services.

- **Service Layer**: Located in `src/services/` (e.g., `entryService.js`, `exitService.js`, `pricingService.js`). Services implement business logic: fee calculation, slab lookups, overstay detection, and orchestration of DB and cache operations.

- **Data Layer**: DB access is configured in `src/config/database.js`. Primary domain entities: Vehicle (session), Space, Organization, Staff, PricingRule, OverstaySlab, TransactionRecord, OverstayCharge. Use DB transactions for multi-step writes (exit -> create transaction + overstay record + update vehicle status).

- **Cache / Session Store (Redis)**: `src/config/redis.js` and `src/services/cacheService.js` handle short-lived state and caching (active sessions, rate-limiting, locks). Use Redis locks (SETNX / Redlock) or similar to protect concurrent exit processing for the same session.

- **Middleware & Auth**: `src/middleware/auth.js` enforces authentication and role-based access. Keep sensitive checks in middleware and service layer for defense-in-depth.

- **Request Flow — Vehicle Entry**:
	1. Client issues `logVehicleEntry` mutation to Apollo Server.
	2. Resolver validates and calls `entryService.logEntry()`.
	3. `entryService` selects pricing (pricingService), computes base fee (`src/utils/calculations.js`), persists Vehicle/session in DB, and caches active session in Redis.
	4. Resolver returns `VehicleEntryResult`.

- **Request Flow — Vehicle Exit**:
	1. Client calls `processVehicleExit(session_id)`.
	2. Resolver acquires a Redis lock for `session_id` to prevent concurrent exits.
	3. `exitService` loads session, computes duration and overstay using pricing/overstay slabs, updates Vehicle status and creates TransactionRecord and OverstayCharge (if any) within a DB transaction.
	4. Cache entries are updated/invalidated, and lock is released.
	5. Resolver returns `ExitResult` including totals and any overstay record.

- **Payment Collection**: `collectOverstayPayment` records collection metadata, updates OverstayCharge as collected, and creates/updates TransactionRecord. Payment provider integration (if any) should be abstracted behind a service for retries and idempotency.

- **Concurrency & Idempotency**: Protect critical paths (exit & payment) with locks and DB transactions. Record idempotency keys (or use session id) where external retries may occur.

- **Scaling & Deployment**: API servers should be stateless; scale horizontally behind a load balancer. Use Redis and the DB as shared state. Containerize with the provided `Dockerfile` and orchestrate with `docker-compose` for local development or Kubernetes for production.

- **Observability & Ops**: Add structured logs, metrics (request durations, overstay rates, revenue), and distributed tracing for high-cardinality flows. Backups and DB migrations should be automated. Monitor Redis memory and eviction policies (active session caching needs predictable TTLs).

- **Security**: Enforce TLS, store secrets in environment variables/secret manager, validate and sanitize inputs, and enforce RBAC checks for sensitive mutations (organization/space management).

- **Testing Strategy**: Unit-test services (`pricingService`, `calculations`, `entryService`, `exitService`) and add integration tests for resolver→service flows. Use test DB and Redis instances (or mocks) in CI.

---

If you'd like, I can also:

- add a shorter README badge/summary to `README.md`
- generate a design diagram for the flow between entry → exit → overstay collection
- run any of the test scripts and report results

Created by the development tooling for this repository.
