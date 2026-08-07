#!/usr/bin/env node
/**
 * Local print agent for MAMA Cafe
 *
 * Run on a café PC that is on the SAME LAN as your thermal printer.
 * The cloud app queues ESC/POS jobs; this agent pulls them and prints.
 *
 * Usage:
 *   set PRINT_AGENT_SECRET=your-shared-secret
 *   set MAMA_API_URL=https://your-app.onrender.com
 *   node scripts/print-agent.mjs
 *
 * Optional:
 *   PRINT_POLL_MS=2000
 */

import net from "net";

const API_URL = (process.env.MAMA_API_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.PRINT_AGENT_SECRET || "";
const POLL_MS = Number(process.env.PRINT_POLL_MS || 2000);

if (!SECRET) {
  console.error("Missing PRINT_AGENT_SECRET (must match server env)");
  process.exit(1);
}

function sendToPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(buffer, () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(8000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Printer timed out"));
    });
    socket.on("error", reject);
  });
}

async function poll() {
  try {
    const res = await fetch(`${API_URL}/api/print-agent/jobs`, {
      headers: { "X-Print-Agent-Token": SECRET },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Poll failed:", res.status, text);
      return;
    }
    const data = await res.json();
    const jobs = data.jobs || [];
    for (const job of jobs) {
      const buf = Buffer.from(job.payloadBase64, "base64");
      try {
        await sendToPrinter(job.printerIp, job.printerPort || 9100, buf);
        console.log(`[ok] ${job.type} → ${job.printerIp}:${job.printerPort}`);
        await fetch(`${API_URL}/api/print-agent/ack`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Print-Agent-Token": SECRET,
          },
          body: JSON.stringify({ jobId: job.id, ok: true }),
        });
      } catch (err) {
        console.error(`[fail] ${job.id}`, err.message || err);
        await fetch(`${API_URL}/api/print-agent/ack`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Print-Agent-Token": SECRET,
          },
          body: JSON.stringify({ jobId: job.id, ok: false, error: String(err.message || err) }),
        });
      }
    }
  } catch (err) {
    console.error("Agent error:", err.message || err);
  }
}

console.log(`MAMA print agent → ${API_URL} (every ${POLL_MS}ms)`);
setInterval(poll, POLL_MS);
poll();
