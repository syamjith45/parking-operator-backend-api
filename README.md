# Parking Operator API

Back-end API for Parking Operator System using Node.js, Express, and GraphQL.

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `.env` (or create `.env`) and add your Supabase credentials:
   ```env
   PORT=4000
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   NODE_ENV=development
   ```

3. **Database Setup**
   Ensure your Supabase project has the required tables and views (`staff`, `pricing_rules`, `vehicles`, `overstay_charges`).
   *Note: Migration was performed manually via Supabase Editor.*

4. **Run Server**
   ```bash
   npm run dev
   ```
   The server will start at `http://localhost:4000`.
   GraphQL Playground available at `http://localhost:4000/graphql`.

## Project Structure
- `src/config`: Database connection
- `src/graphql`: Schema and resolvers
- `src/services`: Business logic
- `src/utils`: Helper functions
- `src/middleware`: Express middleware

## API Usage
See `scripts/migration.sql` for initial data.
Use GraphQL Playground to interact with the API.

### Example Query
```graphql
query {
  pricingRules {
    vehicle_type
    base_fee
  }
}
```
