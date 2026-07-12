DROP TABLE IF EXISTS "orderCounter";
CREATE TABLE "orderCounter" (
  id integer PRIMARY KEY DEFAULT 1,
  "counterDate" date NOT NULL DEFAULT CURRENT_DATE,
  "nextNumber" integer NOT NULL DEFAULT 1
);
INSERT INTO "orderCounter" (id, "counterDate", "nextNumber") VALUES (1, CURRENT_DATE, 1);

CREATE OR REPLACE FUNCTION get_next_order_number()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  next_val integer;
  cur_date date;
BEGIN
  SELECT CURRENT_DATE INTO cur_date;
  -- If the date changed, reset the counter
  UPDATE "orderCounter" SET "counterDate" = cur_date, "nextNumber" = 1 WHERE id = 1 AND "counterDate" <> cur_date;
  -- Increment and return
  UPDATE "orderCounter" SET "nextNumber" = "nextNumber" + 1 WHERE id = 1 RETURNING "nextNumber" - 1 INTO next_val;
  RETURN next_val;
END;
$$;