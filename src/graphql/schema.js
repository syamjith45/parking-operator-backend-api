const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar DateTime

  # ─── Role Documentation ────────────────────────────────────────────────────
  # Valid Staff Roles:
  # - operator: Can log entries/exits, view own space data
  # - manager: Can manage staff, pricing, spaces within own organization
  # - admin: Can manage all organizations and roles (platform-level)

  # ─── Existing types (unchanged) ────────────────────────────────────────────

  type Staff {
    id: ID!
    name: String!
    role: String!
    phone: String
    email: String
    organization_id: ID
    space_id: ID
    user_id: ID!
    is_active: Boolean!
    created_at: DateTime!
    space: Space
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
    parking_mode: String!
    expected_exit_date: DateTime
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

  type PaymentMethod {
    id: ID!
    code: String!
    label: String!
    description: String
    is_active: Boolean!
    created_at: DateTime!
  }

  type OverstayCharge {
    id: ID!
    vehicle_id: ID!
    overstay_minutes: Int!
    fee_amount: Float!
    is_collected: Boolean!
    collected_by: ID
    collected_at: DateTime
    payment_method_code: String
    payment_method: PaymentMethod
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

  type VehicleEntryResult {
    id: ID!
    session_id: String!
    driver_phone: String!
    vehicle_type: String!
    vehicle_number: String
    declared_duration_hours: Int
    parking_mode: String
    expected_exit_date: DateTime
    entry_time: DateTime!
    status: String!
    base_fee_paid: Float!
    space_id: ID
    created_by_staff: Staff
    slab_id_used: ID
    pricing_type_used: String
  }

  type DashboardStats {
    active_vehicles: Int!
    completed_today: Int!
    base_fees_collected: String!
    overstay_fees_collected: String!
    total_revenue_today: String!
    cash_transactions: Int!
    gpay_transactions: Int!
    cash_fees_collected: String!
    gpay_fees_collected: String!
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

  type PricingType {
    id: ID!
    code: String!
    label: String!
    is_active: Boolean!
    created_at: DateTime!
  }

  type VehicleType {
    id: ID!
    code: String!
    label: String!
  }

  type Organization {
    id: ID!
    name: String!
    slug: String!
    phone: String
    email: String
    address: String
    is_active: Boolean!
    owner_id: ID
    pricing_type_id: ID
    pricing_type: PricingType
    created_at: DateTime!
    updated_at: DateTime!
    staff: [Staff]
  }

  type OverstaySlab {
    id: ID!
    organization_id: ID!
    slab_hours: Int!
    slab_fee: Float!
    vehicle_type: String!
    is_active: Boolean!
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

  type AdminRevenueByOrg {
    organizationName: String!
    revenue: Float!
  }

  type AdminGlobalStats {
    totalRevenue: Float!
    activeSessions: Int!
    completedSessions: Int!
    utilizationRate: Float!
    revenueByOrg: [AdminRevenueByOrg!]!
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
    parking_mode: String
    expected_exit_date: DateTime
    space_id: ID
    payment_method_code: String
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

  input OverstaySlabInput {
    slab_hours: Int!
    slab_fee: Float!
    vehicle_type: String
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

  input CreateOperatorInput {
    email: String!
    password: String!
    name: String!
    phone: String
    space_id: ID!
    organization_id: ID
  }

  # ─── Queries ────────────────────────────────────────────────────────────────

  type Query {
    # Dashboard
    activeVehicles: [Vehicle]!
    getVehicleBySession(session_id: String!): Vehicle
    dashboardStats(period: String, start_date: DateTime, end_date: DateTime): DashboardStats!

    # Pricing
    pricingRules: [PricingRule]!
    getPricingRule(vehicle_type: String!): PricingRule
    pricingTypes: [PricingType!]!
    vehicleTypes: [VehicleType!]!

    # Revenue
    revenueSummary(start_date: DateTime, end_date: DateTime): RevenueSummary!
    pendingOverstayCharges: [OverstayCharge]!

    # Payment Methods
    paymentMethods: [PaymentMethod!]!
    paymentMethod(code: String!): PaymentMethod

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
    adminGlobalStats(
      organization_id: String
      start_date: DateTime
      end_date: DateTime
      vehicle_type: String
    ): AdminGlobalStats!

    # Overstay Slabs (NEW)
    overstaySlabs(organization_id: ID!, vehicle_type: String): [OverstaySlab]!

    # Spaces (NEW)
    spaces(organization_id: ID!): [Space!]!
    mySpaces: [Space!]!
    space(id: ID!): Space
    spaceOperators(space_id: ID!): [Staff!]!
    organizationOperators(organization_id: ID!): [Staff!]!
    reassignmentBlockers(staff_id: ID!): ReassignmentBlockers!
  }

  # ─── Mutations ──────────────────────────────────────────────────────────────

  type Mutation {
    # Entry
    logVehicleEntry(input: VehicleEntryInput!): VehicleEntryResult!

    # Exit
    processVehicleExit(session_id: String!): ExitResult!

    # Payment
    collectOverstayPayment(overstay_charge_id: ID!, payment_method_code: String!): OverstayCharge!

    # Pricing
    updatePricingRules(rules: [PricingRuleInput!]!): [PricingRule]!

    # Organizations (NEW)
    createOrganization(input: CreateOrganizationInput!): Organization!
    updateOrganization(id: ID!, input: UpdateOrganizationInput!): Organization!
    deactivateOrganization(id: ID!): Organization!
    setOrganizationPricingType(id: ID!, pricing_type_id: ID!): Organization!

    # Overstay Slabs (NEW)
    createOverstaySlab(organization_id: ID!, input: OverstaySlabInput!): OverstaySlab!
    updateOverstaySlab(id: ID!, input: OverstaySlabInput!): OverstaySlab!
    deleteOverstaySlab(id: ID!): OverstaySlab!

    # Spaces (NEW)
    createSpace(input: CreateSpaceInput!): Space!
    updateSpace(id: ID!, input: UpdateSpaceInput!): Space!
    createOperator(input: CreateOperatorInput!): Staff!
    assignOperatorToSpace(staff_id: ID!, space_id: ID!): Staff!
    reassignOperator(staff_id: ID!, space_id: ID!, force: Boolean): ReassignResult!
  }
`;

module.exports = typeDefs;
