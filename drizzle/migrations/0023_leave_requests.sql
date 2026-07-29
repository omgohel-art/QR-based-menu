CREATE TABLE IF NOT EXISTS "leaveRequests" (
  "id" serial PRIMARY KEY,
  "user_id" varchar(64) NOT NULL,
  "leave_type" varchar(20) NOT NULL,
  "date" varchar(10) NOT NULL,
  "reason" text,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "reviewed_by" varchar(64),
  "reviewed_at" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "lr_userId_idx" ON "leaveRequests" ("user_id");
CREATE INDEX IF NOT EXISTS "lr_date_idx" ON "leaveRequests" ("date");
CREATE INDEX IF NOT EXISTS "lr_status_idx" ON "leaveRequests" ("status");
