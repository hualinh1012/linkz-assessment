/**
 * Mock AXS Payment Page — local development only. No encryption or validation.
 *
 * The main app passes payment details as plain query params when
 * AXS_CHECKOUT_URL points to localhost. This page shows them, lets you
 * simulate success or failure, fires a plain-JSON webhook to the main app,
 * then redirects the browser to the appropriate URL.
 *
 * Usage:
 *   npm run mock:axs           (runs on port 4000 by default)
 *   AXS_CHECKOUT_URL must be http://localhost:4000 in .env.local
 */

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = parseInt(process.env.MOCK_AXS_PORT ?? "4000", 10);

// ── In-memory session store ───────────────────────────────────────────────────

const sessions = new Map();

// ── HTML ─────────────────────────────────────────────────────────────────────

function page(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mock AXS Checkout</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f3f4f6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #fff;
      border-radius: 14px;
      padding: 40px 36px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .sim-banner {
      background: #fef9c3;
      border: 1px solid #fde047;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      color: #713f12;
      margin-bottom: 28px;
      text-align: center;
      line-height: 1.5;
    }
    .logo { font-size: 13px; font-weight: 700; letter-spacing: 0.05em; color: #6b7280;
            text-transform: uppercase; margin-bottom: 20px; }
    h1   { font-size: 20px; font-weight: 600; color: #111; margin-bottom: 6px; }
    .amount { font-size: 34px; font-weight: 700; color: #111; margin-bottom: 8px; }
    .ref { font-size: 12px; color: #9ca3af; margin-bottom: 32px; }
    .ref code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    .buttons { display: flex; flex-direction: column; gap: 12px; }
    button {
      padding: 14px 20px; border-radius: 9px; border: none;
      font-size: 15px; font-weight: 600; cursor: pointer; width: 100%;
      transition: opacity 0.15s, transform 0.1s;
    }
    button:active { transform: scale(0.98); }
    button:disabled { opacity: 0.6; cursor: default; }
    .btn-success { background: #16a34a; color: #fff; }
    .btn-success:hover:not(:disabled) { background: #15803d; }
    .btn-fail { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
    .btn-fail:hover:not(:disabled) { background: #e5e7eb; }
    .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
  <script>
    // Disable only the OTHER button on click — not the one being submitted.
    // A disabled button's value is excluded from form data, which would break
    // the action=success/fail detection in the mock server.
    document.querySelectorAll("button[type=submit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("button[type=submit]").forEach(function (b) {
          if (b !== btn) b.disabled = true;
        });
      });
    });
  </script>
</body>
</html>`;
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // GET /hpp/checkout/:merchantLinkId?merchantRef=&amount=&webhookUrl=&successUrl=&failUrl=
  if (req.method === "GET" && url.pathname.startsWith("/hpp/checkout/")) {
    const merchantRef = url.searchParams.get("merchantRef") ?? "UNKNOWN";
    const amountCents = parseInt(url.searchParams.get("amount") ?? "0", 10);
    const webhookUrl  = url.searchParams.get("webhookUrl");
    const successUrl  = url.searchParams.get("successUrl");
    const failUrl     = url.searchParams.get("failUrl");

    if (!webhookUrl || !successUrl || !failUrl) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing required query params (webhookUrl / successUrl / failUrl)");
      return;
    }

    const sessionId = randomBytes(16).toString("hex");
    sessions.set(sessionId, { merchantRef, amountCents, webhookUrl, successUrl, failUrl });

    const sgd = (amountCents / 100).toFixed(2);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(`
      <div class="sim-banner">
        ⚠️ <strong>Simulation only</strong> — no real payment is processed.
      </div>
      <div class="logo">AXS Checkout (mock)</div>
      <h1>Complete your payment</h1>
      <div class="amount">SGD ${sgd}</div>
      <div class="ref">Reference: <code>${merchantRef}</code></div>
      <form class="buttons" method="POST" action="/pay">
        <input type="hidden" name="sessionId" value="${sessionId}">
        <button type="submit" name="action" value="success" class="btn-success">
          ✓ Simulate successful payment
        </button>
        <button type="submit" name="action" value="fail" class="btn-fail">
          ✗ Simulate failed / declined payment
        </button>
      </form>
      <div class="footer">Mock server · localhost:${PORT}</div>
    `));
    return;
  }

  // POST /pay
  if (req.method === "POST" && url.pathname === "/pay") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      const params     = new URLSearchParams(body);
      const sessionId  = params.get("sessionId");
      const action     = params.get("action");
      const session    = sessions.get(sessionId);

      if (!session) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Session expired — start the payment again.");
        return;
      }
      sessions.delete(sessionId);

      const isSuccess      = action === "success";
      const transactionRef = `MOCK-${randomBytes(8).toString("hex").toUpperCase()}`;

      const webhookPayload = {
        transactionRef,
        merchantRef:     session.merchantRef,
        status:          isSuccess ? "SUCCESS" : "DECLINED",
        amount:          (session.amountCents / 100).toFixed(2),
        currency:        "SGD",
        responseCode:    isSuccess ? "00" : "51",
        paymentScheme:   "MOCK",
        paymentDateTime: new Date().toISOString(),
      };

      // Deliver webhook to the main app first — redirect only after it succeeds.
      let webhookStatus;
      let webhookError;
      try {
        const webhookRes = await fetch(session.webhookUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(webhookPayload),
        });
        webhookStatus = webhookRes.status;
        console.log(webhookRes)
        if (!webhookRes.ok) {
          const body = await webhookRes.text().catch(() => "");
          webhookError = `Webhook returned ${webhookRes.status}: ${body}`;
        }
      } catch (err) {
        webhookError = `Could not reach ${session.webhookUrl}: ${err.message}`;
      }

      if (webhookError) {
        console.error("[mock-axs] Webhook failed —", webhookError);
        res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page(`
          <div class="sim-banner" style="background:#fee2e2;border-color:#f87171;color:#991b1b">
            ⚠️ Webhook delivery failed
          </div>
          <h1 style="font-size:18px;font-weight:600;margin-bottom:8px">Could not confirm payment</h1>
          <p style="font-size:13px;color:#6b7280;margin-bottom:16px">${webhookError}</p>
          <p style="font-size:13px;color:#6b7280">
            Make sure the main app is running on
            <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px">${session.webhookUrl.replace(/\/api.*/, "")}</code>
            and check its console for errors.
          </p>
        `));
        return;
      }

      console.log(`[mock-axs] Webhook → ${webhookStatus} (${webhookPayload.status}) — redirecting browser`);
      res.writeHead(302, { Location: isSuccess ? session.successUrl : session.failUrl });
      res.end();
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n[mock-axs] Running on http://localhost:${PORT}`);
  console.log(`[mock-axs] AXS_CHECKOUT_URL must be http://localhost:${PORT} in .env.local\n`);
});
