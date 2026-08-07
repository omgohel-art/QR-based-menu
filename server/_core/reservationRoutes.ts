import { Router, Request, Response } from "express";
import { getDb } from "../db";
import { reservations, businessSettings } from "../../drizzle/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import { getUserIdFromToken } from "./authRoutes";

const router = Router();

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = getUserIdFromToken(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  try {
    const API_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?auth_user_id=eq.${userId}&select=role`, {
      headers: { apikey: API_KEY, Authorization: `Bearer ${API_KEY}` },
    });
    const profiles = await r.json();
    if (!profiles?.[0] || profiles[0].role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return userId;
  } catch {
    res.status(500).json({ error: "Internal server error" });
    return null;
  }
}

// Public: Check if reservations are enabled
router.get("/api/public/reservations-enabled", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available" });
    const data = await db.select({ reservationEnabled: businessSettings.reservationEnabled })
      .from(businessSettings).limit(1).then((rows) => rows[0] ?? null);
    res.json({ enabled: data?.reservationEnabled ?? false });
  } catch (err) {
    console.error("[Reservations] Failed to fetch settings:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Public: Create a new reservation (customer-facing booking)
router.post("/api/public/reservations", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available" });

    // Check if reservations are enabled
    const settings = await db.select({ reservationEnabled: businessSettings.reservationEnabled })
      .from(businessSettings).limit(1).then((rows) => rows[0] ?? null);
    if (!settings?.reservationEnabled) {
      return res.status(403).json({ error: "Reservations are currently disabled" });
    }

    const { customerName, customerPhone, date, time, pax, notes } = req.body;
    if (!customerName || !customerPhone || !date || !time || !pax) {
      return res.status(400).json({ error: "Missing required fields: customerName, customerPhone, date, time, pax" });
    }

    const [newReservation] = await db.insert(reservations).values({
      customerName: String(customerName).slice(0, 128),
      customerPhone: String(customerPhone).slice(0, 20),
      date: String(date).slice(0, 10),
      time: String(time).slice(0, 10),
      pax: Number(pax),
      notes: notes ? String(notes) : null,
      status: "pending",
    }).returning();

    res.status(201).json(newReservation);
  } catch (err) {
    console.error("[Reservations] Failed to create:", err);
    res.status(500).json({ error: "Failed to create reservation" });
  }
});

// Admin: List reservations (filterable by date, status)
router.get("/api/admin/reservations", async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available" });

    const { date, status } = req.query;

    const conditions = [];
    if (date && typeof date === "string") {
      conditions.push(eq(reservations.date, date));
    }
    if (status && typeof status === "string") {
      conditions.push(eq(reservations.status, status));
    }

    const rows = conditions.length > 0
      ? await db.select().from(reservations).where(and(...conditions)).orderBy(reservations.createdAt)
      : await db.select().from(reservations).orderBy(reservations.createdAt);

    res.json(rows);
  } catch (err) {
    console.error("[Reservations] Failed to list:", err);
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

// Admin: Update reservation status (confirm / cancel / complete)
router.patch("/api/admin/reservations/:id", async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid reservation ID" });

    const { status } = req.body;
    if (!status || !["pending", "confirmed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: pending, confirmed, cancelled, or completed" });
    }

    const [updated] = await db.update(reservations)
      .set({ status, updatedAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Reservation not found" });

    res.json(updated);
  } catch (err) {
    console.error("[Reservations] Failed to update:", err);
    res.status(500).json({ error: "Failed to update reservation" });
  }
});

// Admin: Delete a reservation
router.delete("/api/admin/reservations/:id", async (req: Request, res: Response) => {
  const userId = await requireAdmin(req, res);
  if (!userId) return;

  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid reservation ID" });

    await db.delete(reservations).where(eq(reservations.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("[Reservations] Failed to delete:", err);
    res.status(500).json({ error: "Failed to delete reservation" });
  }
});

// Public: Get reservations for a specific date (e.g. to show available slots on customer side)
router.get("/api/public/reservations/by-date", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database not available" });

    // Check if reservations are enabled
    const settings = await db.select({ reservationEnabled: businessSettings.reservationEnabled })
      .from(businessSettings).limit(1).then((rows) => rows[0] ?? null);
    if (!settings?.reservationEnabled) {
      return res.json([]);
    }

    const date = typeof req.query.date === "string" ? req.query.date : null;
    if (!date) return res.status(400).json({ error: "Date query parameter required" });

    const rows = await db.select().from(reservations)
      .where(and(eq(reservations.date, date)))
      .orderBy(reservations.time);

    res.json(rows);
  } catch (err) {
    console.error("[Reservations] Failed to fetch by date:", err);
    res.status(500).json({ error: "Failed to fetch reservations" });
  }
});

export default router;