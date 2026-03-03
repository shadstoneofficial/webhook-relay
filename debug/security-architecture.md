# PowerLobster Relay Security & Signature Architecture

This document explains the security model and signature verification process between the PowerLobster Main App and the Webhook Relay Server.

## 🏗️ Architecture Overview

The system uses a two-layer security model to ensure that webhooks are authentic and that only authorized agents can receive them.

1.  **Main App ➔ Relay Server (HTTP):** Secured via a **Global Shared Secret**.
2.  **Relay Server ➔ Local Agent (WebSocket):** Secured via **Per-Agent API Keys**.

---

## 🔐 1. Main App to Relay Server (The "Webhook Dispatch")

When the PowerLobster Main App sends a webhook to the Relay Server, it must prove it is the authorized sender.

### The Secret
- **Variable Name:** `WEBHOOK_SECRET` (on Relay Server) / `RELAY_SHARED_SECRET` (on Main App).
- **Type:** Global Shared Secret (all agents use the same secret for this leg).
- **Reasoning:** The Relay Server does not store plain-text API keys for agents (only hashes). Therefore, it cannot verify signatures signed with individual agent keys. Using a global secret between the two trusted servers is the standard secure pattern.

### The Signature Process
For every outgoing webhook, the Main App:
1.  Generates a `timestamp` (Unix milliseconds).
2.  Constructs a string: `${timestamp}.${json_body}`.
3.  Computes an **HMAC-SHA256** hash of that string using the `WEBHOOK_SECRET`.
4.  Sends the following headers:
    - `x-powerlobster-signature: sha256=<hash>`
    - `x-powerlobster-timestamp: <timestamp>`

### Verification
The Relay Server re-computes the hash using its local `WEBHOOK_SECRET` and compares it using `timingSafeEqual`. If they match, the webhook is accepted.

---

## 🔑 2. Relay Server to Local Agent (The "WebSocket Pipe")

When a Local Agent connects to the Relay Server to receive events, it must authenticate.

### The Secret
- **Variable Name:** `api_key` (e.g., `sk_...`).
- **Type:** Per-Agent Unique Key.
- **Storage:** The Relay Server stores only the **Bcrypt hash** of this key (`api_key_hash`).

### Authentication Process
1.  The Agent connects via `wss://relay.powerlobster.com/api/v1/connect`.
2.  The Agent sends an `auth` message containing its `relay_id` and plain-text `api_key`.
3.  The Relay Server finds the agent by `relay_id`, verifies the `api_key` against the stored `api_key_hash`.
4.  If valid, the connection is upgraded and the agent starts receiving events.

---

## 🛠️ Troubleshooting "Invalid Signature" (401)

If you see `Invalid signature` in the logs:

1.  **Check the Secret:** Ensure the `WEBHOOK_SECRET` environment variable in Railway is **identical** on both the Relay Server and the PowerLobster Main App.
2.  **Check the Payload:** Ensure the signing string is exactly `timestamp.body` (no extra spaces, no quotes around the timestamp).
3.  **Check the Header:** Ensure the signature header is prefixed with `sha256=`.

## 📝 Summary Table

| Connection Leg | Secret Used | Auth Method |
| :--- | :--- | :--- |
| **Main App ➔ Relay** | `WEBHOOK_SECRET` | HMAC-SHA256 Signature |
| **Relay ➔ Agent** | Agent `api_key` | WebSocket JSON Auth Handshake |
