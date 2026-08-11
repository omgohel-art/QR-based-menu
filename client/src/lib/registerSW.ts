// Registers the offline service worker. No-op in dev unless SW are explicitly enabled.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}
