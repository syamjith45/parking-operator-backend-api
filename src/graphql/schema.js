const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar DateTime

  # ─── Existing types (unchanged) ────────────────────────────────────────────

  type Staff {
    id: ID!
    name: String!
    role: String!
    phone: String
    email: String
    organization_id: ID
    space_id: ID
  }

  type PricingRule {
    id: ID!
    vehicle_type: String!
    base_fee: Float!
    base_hours: Int!
    extra_hour_rate: Float!
    space_id: ID
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
    space_id: ID
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
    space_id: ID
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

  # ─── NEW types ──────────────────────────────────────────────────────────────

  type Organization {
    id: ID!
    name: String!
    slug: String!
    phone: String
    email: String
    address: String
    is_active: Boolean!
    owner_id: ID
    created_at: DateTime!
    updated_at: DateTime!
    staff: [Staff]
  }

  type Space {
    id: ID!
    organization_id: ID!
    name: String!
    location: String
    capacity: Int
    is_active: Boolean!
    created_at: DateTime!
    organization: Organization
    operators: [Staff]
  }

  type OrgStats {
    organization_id: ID!
    active_vehicles: Int!
    completed_today: Int!
    revenue_today: String!
  }

  type ReassignmentBlockers {
    can_reassign_safely: Boolean!
    active_sessions: [Vehicle!]!
    pending_charges: [OverstayCharge!]!
    pending_charges_total: String!
  }

  type ReassignResult {
    staff: Staff!
    previous_space_id: ID
    new_space_id: ID!
    warnings: [String!]!
  }

  type MyProfile {
    id: ID!
    name: String!
    role: String!
    phone: String
    email: String
    space_id: ID
    organization_id: ID
    space: Space
    organization: Organization
  }

  # ─── Inputs ─────────────────────────────────────────────────────────────────

  input VehicleEntryInput {
    driver_phone: String!
    vehicle_type: String!
    vehicle_number: String
    declared_duration_hours: Int
  }

  input PricingRuleInput {
    vehicle_type: String!
    base_fee: Float
    base_hours: Int
    extra_hour_rate: Float
  }

  input CreateOrganizationInput {
    name: String!
    slug: String!
    phone: String
    email: String
    address: String
  }

  input UpdateOrganizationInput {
    name: String
    phone: String
    email: String
    address: String
    is_active: Boolean
  }

  input CreateSpaceInput {
    organization_id: ID!
    name: String!
    location: String
    capacity: Int
  }

  input UpdateSpaceInput {
    name: String
    location: String
    capacity: Int
    is_active: Boolean
  }

  # ─── Queries ────────────────────────────────────────────────────────────────

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
    myProfile: MyProfile

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

    # Organizations (NEW)
    organization(id: ID!): Organization
    organizations: [Organization!]!
    myOrganization: Organization
    orgStats(id: ID): OrgStats!

    # Spaces (NEW)
    spaces(organization_id: ID!): [Space!]!
    space(id: ID!): Space
    spaceOperators(space_id: ID!): [Staff!]!
    reassignmentBlockers(staff_id: ID!): ReassignmentBlockers!
  }

  # ─── Mutations ──────────────────────────────────────────────────────────────

  type Mutation {
    # Entry
    logVehicleEntry(input: VehicleEntryInput!): Vehicle!

    # Exit
    processVehicleExit(session_id: String!): ExitResult!

    # Payment
    collectOverstayPayment(overstay_charge_id: ID!): OverstayCharge!

    # Pricing
    updatePricingRules(rules: [PricingRuleInput!]!): [PricingRule]!

    # Organizations (NEW)
    createOrganization(input: CreateOrganizationInput!): Organization!
    updateOrganization(id: ID!, input: UpdateOrganizationInput!): Organization!
    deactivateOrganization(id: ID!): Organization!

    # Spaces (NEW)
    createSpace(input: CreateSpaceInput!): Space!
    updateSpace(id: ID!, input: UpdateSpaceInput!): Space!
    assignOperatorToSpace(staff_id: ID!, space_id: ID!): Staff!
    reassignOperator(staff_id: ID!, space_id: ID!, force: Boolean): ReassignResult!
  }
`;

module.exports = typeDefs;
