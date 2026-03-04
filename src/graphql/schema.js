const { gql } = require('apollo-server-express');

const typeDefs = gql`
  # Custom scalars
  scalar DateTime

  # Types
  type Staff {
    id: ID!
    name: String!
    role: String!
    phone: String
    email: String
  }

  type PricingRule {
    id: ID!
    vehicle_type: String!
    base_fee: Float!
    base_hours: Int!
    extra_hour_rate: Float!
  }

  type Vehicle {
    id: ID!
    session_id: String!
    driver_phone: String!
    vehicle_type: String!
    vehicle_number: String
    declared_duration_hours: Int
    entry_time: DateTime!
    exit_time: DateTime
    status: String!
    base_fee_paid: Float!
    duration_minutes: Int
    is_overstay: Boolean
    overstay_minutes: Int
    created_by_staff: Staff
    overstay_charges: [OverstayCharge]
  }

  type OverstayCharge {
    id: ID!
    vehicle_id: ID!
    overstay_minutes: Int!
    fee_amount: Float!
    is_collected: Boolean!
    collected_by: ID
    collected_at: DateTime
    vehicle: Vehicle
  }

  type ExitResult {
    session_id: String!
    vehicle_type: String!
    driver_phone: String!
    entry_time: DateTime!
    exit_time: DateTime!
    duration_minutes: Int!
    base_fee_paid: Float!
    overstay_minutes: Int!
    overstay_fee: Float!
    total_amount: Float!
    overstay_record: OverstayCharge
  }

  type DashboardStats {
    active_vehicles: Int!
    completed_today: Int!
    base_fees_collected: String!
    overstay_fees_collected: String!
    total_revenue_today: String!
  }

  type RevenueSummary {
    period: Period!
    total_sessions: Int!
    base_fees: String!
    overstay_fees_collected: String!
    overstay_fees_pending: String!
    total_revenue: String!
    by_vehicle_type: [VehicleTypeRevenue]!
  }

  type Period {
    start: DateTime!
    end: DateTime!
  }

  type VehicleTypeRevenue {
    vehicle_type: String!
    sessions: Int!
    revenue: String!
  }

  type TransactionRecord {
    id: ID!
    session_id: String!
    driver_phone: String!
    vehicle_type: String!
    vehicle_number: String
    entry_time: DateTime!
    exit_time: DateTime
    status: String!
    base_fee_paid: Float!
    duration_minutes: Int
    declared_duration_hours: Int
    overstay_minutes: Int
    overstay_fee: Float
    total_amount: Float!
    created_by_staff: Staff
    overstay_charges: [OverstayCharge]
  }

  type TransactionHistoryResult {
    records: [TransactionRecord!]!
    total_count: Int!
    page: Int!
    page_size: Int!
    total_pages: Int!
  }

  # Inputs
  input VehicleEntryInput {
    driver_phone: String!
    vehicle_type: String!
    vehicle_number: String
    declared_duration_hours: Int
    # staff_id is now inferred from context
  }

  input PricingRuleInput {
    vehicle_type: String!
    base_fee: Float
    base_hours: Int
    extra_hour_rate: Float
  }

  # Queries
  type Query {
    # Dashboard
    activeVehicles: [Vehicle]!
    getVehicleBySession(session_id: String!): Vehicle
    dashboardStats: DashboardStats!

    # Pricing
    pricingRules: [PricingRule]!
    getPricingRule(vehicle_type: String!): PricingRule

    # Revenue
    revenueSummary(start_date: DateTime, end_date: DateTime): RevenueSummary!
    pendingOverstayCharges: [OverstayCharge]!

    # Staff
    staff(id: ID!): Staff
    me: Staff

    # Transactions
    transactionHistory(
      page: Int
      page_size: Int
      status: String
      vehicle_type: String
      start_date: DateTime
      end_date: DateTime
      search: String
    ): TransactionHistoryResult!
  }

  # Mutations
  type Mutation {
    # Entry
    logVehicleEntry(input: VehicleEntryInput!): Vehicle!
    
    # Exit
    processVehicleExit(session_id: String!): ExitResult!
    
    # Payment
    collectOverstayPayment(overstay_charge_id: ID!): OverstayCharge!

    # Settings / Configuration
    updatePricingRules(rules: [PricingRuleInput!]!): [PricingRule]!
  }
`;

module.exports = typeDefs;
