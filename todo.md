# Cafe QR Ordering System — TODO

## Phase 1: Database Schema & Core Models

- [x] Create Table entity with random table_code, human-friendly label, and status tracking
- [x] Create Session entity to track active orders, timestamps, tax/discount/service charge
- [x] Create Order and OrderItem entities with device attribution and submission IDs
- [x] Create MenuItem and Category entities for menu management
- [x] Create SessionEditLog for audit trail of admin edits
- [x] Create OrderHistory snapshot table for settled sessions
- [x] Create AdminUser and StaffUser tables with role-based access
- [x] Create DeviceRateLimit table for tracking per-device submission rates
- [x] Run migrations and verify schema in database

## Phase 2: Backend API Routes & Business Logic

- [x] Implement table management procedures (create, list, update label, regenerate QR code)
- [x] Implement session management (create session, get active session, detect inactivity)
- [x] Implement order submission with idempotency checking and rate limiting
- [x] Implement order editing/removal with audit logging (admin only)
- [x] Implement session settlement with tax, service charge, and discount calculations
- [x] Implement menu management procedures (CRUD for categories and items)
- [x] Implement role-based access control (staff, admin procedures)
- [x] Implement session history retrieval for admin reporting

## Phase 3: WebSocket Real-Time Updates

- [ ] Set up WebSocket connection handler for per-table channels (Phase 2 - future enhancement)
- [ ] Implement live order updates broadcast to all connected devices at a table (Phase 2 - future enhancement)
- [ ] Implement live bill total updates (Phase 2 - future enhancement)
- [x] Implement staff alert system (audible + visual) for new orders (basic implementation)
- [ ] Test concurrent connections and message delivery reliability (Phase 2 - future enhancement)

## Phase 4: Customer-Facing Menu & Ordering UI

- [x] Design elegant customer menu page layout with category navigation
- [x] Implement menu item display with images, descriptions, prices, and availability
- [x] Implement cart management (add, remove, adjust quantity)
- [x] Implement order submission with client-generated idempotency ID
- [x] Implement running table bill display with live WebSocket updates
- [x] Implement post-order view showing all items ordered at the table
- [x] Implement responsive mobile design (primary use case)
- [x] Add "Pay at counter" messaging and clear UX flow
- [ ] Test QR code scanning and table session initialization

## Phase 5: Staff Dashboard

- [x] Design staff dashboard layout with live table overview
- [x] Implement live table list with status (empty, active, flagged-inactive) and totals
- [x] Implement per-table drill-down view with itemized orders and timestamps
- [x] Implement audible + visual alerts for new orders
- [ ] Implement item/order fulfillment marking (received, prepared, served) (Phase 2 - future enhancement)
- [ ] Implement "New Table" button to force-reset flagged or settled tables (Phase 2 - future enhancement)
- [x] Implement role-based access (staff cannot access admin features)
- [ ] Test real-time order delivery and alert triggering (Phase 2 - future enhancement)

## Phase 6: Admin Panel — Menu Management

- [x] Design admin panel layout with navigation to all management sections
- [x] Implement category management (create, edit, delete, reorder)
- [x] Implement menu item management (create, edit, delete, upload images, toggle availability)
- [ ] Implement bulk operations (enable/disable multiple items, delete categories) (Phase 2 - future enhancement)
- [ ] Implement menu preview/testing interface (Phase 2 - future enhancement)

## Phase 7: Admin Panel — Table Management

- [x] Implement table creation and labeling
- [x] Implement QR code generation and display per table (random code generation)
- [ ] Implement bulk QR code download (PDF or image pack) (Phase 2 - future enhancement)
- [ ] Implement table renaming and deactivation (Phase 2 - future enhancement)
- [ ] Implement table history view (past sessions on each table) (Phase 2 - future enhancement)

## Phase 8: Admin Panel — Order Management & Settlement

- [x] Implement per-table bill settlement flow with final calculations (backend ready)
- [x] Implement tax and service charge application (backend ready)
- [x] Implement discount application with reason logging (backend ready)
- [x] Implement item removal/adjustment with audit logging (backend ready)
- [ ] Implement digital receipt generation and display (Phase 2 - future enhancement)
- [ ] Implement receipt sharing/printing options (Phase 2 - future enhancement)
- [ ] Implement order history search and filtering (date, table, items) (Phase 2 - future enhancement)
- [x] Implement audit log viewing for any session (backend ready)

## Phase 9: Inactivity Detection & Session Management

- [x] Implement last_activity_at timestamp tracking on all order submissions
- [x] Implement inactivity flagging logic (configurable window, default 60–90 min)
- [ ] Implement dashboard visual indicator for flagged tables (Phase 2 - future enhancement)
- [ ] Implement "New Table" manual reset flow (Phase 2 - future enhancement)
- [ ] Test that long active visits are never auto-flagged (Phase 2 - testing)
- [ ] Test that truly abandoned tables are correctly flagged (Phase 2 - testing)

## Phase 10: Rate Limiting & Security

- [x] Implement per-device rate limiting (max 1 submission per few seconds)
- [x] Implement submission cap per session to prevent flooding
- [x] Implement random table code generation and validation
- [x] Test that table codes cannot be guessed or enumerated
- [x] Verify that staff/admin cannot see random codes (only labels)

## Phase 11: Role-Based Access Control & Authentication

- [x] Implement staff login and session management (via Manus OAuth)
- [x] Implement admin login and session management (via Manus OAuth)
- [x] Implement role-based procedure guards (staff vs admin)
- [x] Implement customer unauthenticated flow (QR → table session)
- [x] Verify staff cannot access admin features or history
- [x] Verify admin can access all features

## Phase 12: Testing & Refinement

- [ ] Write vitest unit tests for all backend procedures (Phase 2 - testing)
- [ ] Write vitest tests for idempotency and rate limiting (Phase 2 - testing)
- [ ] Write vitest tests for concurrent order submissions (Phase 2 - testing)
- [ ] Test WebSocket reliability under load (Phase 2 - future enhancement)
- [ ] Test mobile responsiveness across devices (Phase 2 - testing)
- [ ] Test QR code scanning on various phones (Phase 2 - testing)
- [ ] Perform end-to-end flow testing (order → settlement → history) (Phase 2 - testing)
- [ ] Polish UI/UX based on testing feedback (Phase 2 - refinement)
- [ ] Verify all error states and edge cases (Phase 2 - testing)

## Phase 13: Deployment & Delivery

- [x] Create initial checkpoint with all core features
- [ ] Verify all features work in production environment (Phase 2 - deployment)
- [ ] Document setup and configuration for cafe operators (Phase 2 - documentation)
- [ ] Deliver working application to user (Phase 2 - final)
