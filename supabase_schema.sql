-- Supabase PostgreSQL Schema

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  "openId" VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  "loginMethod" VARCHAR(64),
  role VARCHAR(50) DEFAULT 'user' NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "lastSignedIn" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE tables (
  id SERIAL PRIMARY KEY,
  "tableCode" VARCHAR(32) NOT NULL UNIQUE,
  label VARCHAR(64) NOT NULL,
  status VARCHAR(50) DEFAULT 'empty' NOT NULL,
  "activeSessionId" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "tableCode_idx" ON tables("tableCode");

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  "tableId" INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'open' NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "lastActivityAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "settledAt" TIMESTAMP WITH TIME ZONE,
  "settledBy" INTEGER,
  subtotal DECIMAL(10,2) DEFAULT 0 NOT NULL,
  "taxAmount" DECIMAL(10,2) DEFAULT 0 NOT NULL,
  "serviceCharge" DECIMAL(10,2) DEFAULT 0 NOT NULL,
  "discountAmount" DECIMAL(10,2) DEFAULT 0 NOT NULL,
  "discountReason" TEXT,
  "finalTotal" DECIMAL(10,2) DEFAULT 0 NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "tableId_idx" ON sessions("tableId");
CREATE INDEX "status_idx" ON sessions(status);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  "displayOrder" INTEGER DEFAULT 0 NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE "menuItems" (
  id SERIAL PRIMARY KEY,
  "categoryId" INTEGER NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  "imageUrl" TEXT,
  "isAvailable" BOOLEAN DEFAULT TRUE NOT NULL,
  "displayOrder" INTEGER DEFAULT 0 NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "categoryId_idx" ON "menuItems"("categoryId");

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  "sessionId" INTEGER NOT NULL,
  "submissionId" VARCHAR(64) NOT NULL UNIQUE,
  "deviceToken" VARCHAR(64) NOT NULL,
  "submittedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "sessionId_idx" ON orders("sessionId");
CREATE INDEX "submissionId_idx" ON orders("submissionId");

CREATE TABLE "orderItems" (
  id SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL,
  "menuItemId" INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  "priceAtOrderTime" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "orderId_idx" ON "orderItems"("orderId");

CREATE TABLE "sessionEditLogs" (
  id SERIAL PRIMARY KEY,
  "sessionId" INTEGER NOT NULL,
  "changedBy" INTEGER NOT NULL,
  "changeType" VARCHAR(50) NOT NULL,
  "itemId" INTEGER,
  "oldValue" TEXT,
  "newValue" TEXT,
  reason TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "sessionEditLog_sessionId_idx" ON "sessionEditLogs"("sessionId");

CREATE TABLE "orderHistories" (
  id SERIAL PRIMARY KEY,
  "sessionId" INTEGER NOT NULL UNIQUE,
  "tableLabel" VARCHAR(64) NOT NULL,
  "itemsSnapshot" JSONB NOT NULL,
  "editsSnapshot" JSONB NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  "taxAmount" DECIMAL(10,2) NOT NULL,
  "serviceCharge" DECIMAL(10,2) NOT NULL,
  "discountAmount" DECIMAL(10,2) NOT NULL,
  "discountReason" TEXT,
  "finalTotal" DECIMAL(10,2) NOT NULL,
  "settledBy" INTEGER NOT NULL,
  "settledAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "orderHistories_sessionId_idx" ON "orderHistories"("sessionId");

CREATE TABLE "deviceRateLimits" (
  id SERIAL PRIMARY KEY,
  "deviceToken" VARCHAR(64) NOT NULL UNIQUE,
  "lastSubmissionAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "submissionCount" INTEGER DEFAULT 0 NOT NULL,
  "windowResetAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
CREATE INDEX "deviceToken_idx" ON "deviceRateLimits"("deviceToken");

CREATE TABLE "cafeSettings" (
  id SERIAL PRIMARY KEY,
  "taxPercentage" DECIMAL(5,2) DEFAULT 0 NOT NULL,
  "serviceChargePercentage" DECIMAL(5,2) DEFAULT 0 NOT NULL,
  "inactivityWindowMinutes" INTEGER DEFAULT 75 NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
