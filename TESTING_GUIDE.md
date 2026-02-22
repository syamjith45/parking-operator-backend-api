# 🧪 Parking API Testing Guide

This guide explains how to test the Parking Operator API, including handling authentication and seeding initial data.

## 1. Prerequisites
- Node.js installed
- Running Supabase project (URL and Key in `.env`)
- `npm install` completed

## 2. Start the Server
```bash
npm start
```
Server runs at: `http://localhost:4000`
GraphQL Endpoint: `http://localhost:4000/graphql`

## 3. Seeding Data (First Time Setup)
If your database is empty, you need to add **Pricing Rules** and at least one **Staff Member**.

### Step A: Seed Pricing Rules
Run the seed script:
```bash
node seed-api.js
```
This will create default pricing rules for Car, Bike, and Truck.

### Step B: Create a Staff Member
Since the API uses Supabase Auth, every Staff member must be linked to a real Supabase User (via `user_id`).

1.  **Sign Up / Sign In** to your Supabase project (or use your client app) to get a valid User ID (UUID).
2.  **Run Seed with User ID**:
    ```bash
    # Replace with your actual UUID
    # On Windows (PowerShell):
    $env:USER_ID="your-uuid-here"; node seed-api.js
    
    # On Mac/Linux/Bash:
    USER_ID=your-uuid-here node seed-api.js
    ```

## 4. Testing Endpoints

### A. Public Queries (No Auth Required)
You can test this in GraphQL Playground (`http://localhost:4000/graphql`).

```graphql
query {
  pricingRules {
    id
    vehicle_type
    base_fee
  }
}
```

### B. Authenticated Operations
To perform mutations (Entry/Exit) or view sensitive data (`me`), you need an **Authorization Header**.

1.  **Get a JWT Token**: Login via your frontend app or Supabase dashboard to get an `access_token`.
2.  **Configure Headers** in Playground:
    ```json
    {
      "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
    }
    ```

### C. Test Scenarios

#### 1. Check Current User
```graphql
query {
  me {
    id
    name
    role
  }
}
```

#### 2. Log Vehicle Entry
```graphql
mutation {
  logVehicleEntry(input: {
    driver_phone: "555-0199"
    vehicle_type: "car"
    vehicle_number: "ABC-123"
  }) {
    id
    session_id
    status
    entry_time
  }
}
```

#### 3. Check Dashboard
```graphql
query {
  dashboardStats {
    active_vehicles
    total_revenue_today
  }
}
```

#### 4. Process Exit
```graphql
# Use session_id from Entry response
mutation {
  processVehicleExit(session_id: "PKG-...") {
    total_amount
    duration_minutes
  }
}
```
