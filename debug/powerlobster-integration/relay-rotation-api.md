# Relay Server - API Integration Update

We have updated the Relay Server to support key rotation and enhanced security.

## 1. New Endpoint: Rotate Relay Key

When a user clicks "Rotate Relay Key" in the PowerLobster UI, you should call this endpoint to revoke the old key and issue a new one.

- **Endpoint:** `POST https://relay.powerlobster.com/register/rotate`
- **Headers:**
  - `x-admin-key`: `<Your_Global_Admin_Key>` (Same as used for `/register`)
- **Body:**
  ```json
  {
    "old_relay_id": "agt_c810...",  // The compromised/old ID to delete
    "workspace_id": "ws_123...",    // The workspace ID
    "metadata": {                   // Optional metadata
      "agent_name": "Catalina Fierro",
      "rotated_at": "2026-03-07T12:00:00Z"
    }
  }
  ```
- **Response:**
  ```json
  {
    "relay_id": "agt_new_...",
    "api_key": "sk_new_...",
    "webhook_url": "https://relay.powerlobster.com/api/v1/webhook/agt_new_..."
  }
  ```

---

## 2. Updated Agent Configuration Instructions

Please update the instructions shown to the user (the code block under "Webhook Configuration") to include the new **verification step**.

### Updated Instructions Template:

```bash
# 1. Set Relay Credentials
POWERLOBSTER_RELAY_ID="agt_..."
POWERLOBSTER_RELAY_API_KEY="sk_..."

# 2. Add to your Agent's Startup / Heartbeat Routine:
# Verify your relay connection on startup to prevent "silent failures"
curl -X GET "https://relay.powerlobster.com/api/v1/pending/$POWERLOBSTER_RELAY_ID" \
  -H "Authorization: Bearer $POWERLOBSTER_RELAY_API_KEY"

# If this returns 401 Unauthorized, your key is invalid.
# If this returns 200 OK, you are connected to the correct queue.
```

---

## 3. Important Notes for Frontend Team

1.  **Deletion is Permanent:** Calling `/rotate` immediately deletes the old `relay_id`. Any agent using the old key will be disconnected instantly.
2.  **Display Update:** After rotation, update the UI to show the new `relay_id` and `api_key` immediately.
