import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Calendar, Clock, Users, Phone, User, Check, Loader2, AlertCircle } from "lucide-react";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 11; h <= 22; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

export default function ReservationPage() {
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    date: todayStr(),
    time: TIME_SLOTS[0],
    pax: 2,
    notes: "",
  });
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  const bookMutation = useMutation({
    mutationFn: async () => {
      setError("");
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          date: form.date,
          time: form.time,
          pax: form.pax,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to book reservation");
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmed(true);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-lg text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="w-10 h-10 text-green-600" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Reservation Confirmed!</h1>
          <p className="text-slate-600 mb-6">
            Your table for <span className="font-bold text-slate-900">{form.pax} guest{form.pax !== 1 ? "s" : ""}</span> on{" "}
            <span className="font-bold text-slate-900">{form.date}</span> at{" "}
            <span className="font-bold text-slate-900">{form.time}</span> is confirmed.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            We'll see you soon, {form.customerName}! Please arrive on time.
          </p>
          <button
            onClick={() => {
              setConfirmed(false);
              setForm({ customerName: "", customerPhone: "", date: todayStr(), time: TIME_SLOTS[0], pax: 2, notes: "" });
            }}
            className="text-amber-600 hover:text-amber-700 font-medium text-sm"
          >
            Make another reservation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-100 flex items-center justify-center">
            <Calendar className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Reserve a Table</h1>
          <p className="text-slate-600">Book your spot in advance</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            bookMutation.mutate();
          }}
          className="bg-white rounded-3xl p-6 shadow-lg space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <User className="w-4 h-4 inline mr-1" /> Your Name
            </label>
            <input
              type="text"
              required
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              placeholder="John Doe"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Phone className="w-4 h-4 inline mr-1" /> Phone Number
            </label>
            <input
              type="tel"
              required
              value={form.customerPhone}
              onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
              placeholder="+91 98765 43210"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Calendar className="w-4 h-4 inline mr-1" /> Date
              </label>
              <input
                type="date"
                required
                value={form.date}
                min={todayStr()}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-3 rounded-xl border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <Clock className="w-4 h-4 inline mr-1" /> Time
              </label>
              <select
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full px-3 py-3 rounded-xl border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all bg-white"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <Users className="w-4 h-4 inline mr-1" /> Number of Guests
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm({ ...form, pax: Math.max(1, form.pax - 1) })}
                className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-lg font-bold text-slate-600"
              >
                −
              </button>
              <div className="flex-1 text-center text-xl font-bold text-slate-900">{form.pax}</div>
              <button
                type="button"
                onClick={() => setForm({ ...form, pax: Math.min(20, form.pax + 1) })}
                className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-lg font-bold text-slate-600"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Special Requests (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Birthday celebration, window seat preferred, etc."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all resize-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={bookMutation.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {bookMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Booking...
              </>
            ) : (
              "Confirm Reservation"
            )}
          </button>

          <p className="text-xs text-center text-slate-400 pt-2">
            You'll receive a confirmation once the café reviews your booking.
          </p>
        </form>
      </div>
    </div>
  );
}