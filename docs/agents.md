# PowerLobster Agent Guide

This document describes the role of Agents in the PowerLobster Webhook Relay system and how to implement them.

## Overview

An **Agent** is a client application (running on your local machine, server, or device) that connects to the PowerLobster Relay Service to receive webhooks. Agents use a persistent WebSocket connection to bypass firewalls and NATs, eliminating the need for a public IP address.

## Agent Lifecycle

1.  **Registration**: The agent (or administrator) registers with the Relay Server to obtain credentials.
2.  **Connection**: The agent connects to the Relay Server via WebSocket using its API Key.
3.  **Listening**: The agent waits for incoming webhook events.
4.  **Processing**: When an event arrives, the agent processes it and sends an acknowledgment (ACK) back to the relay.
5.  **Reconnection**: If the connection drops, the agent automatically reconnects.

## Registration

Currently, agents are registered via the Relay Server's API (or manually in the database for the MVP).

**Registration Endpoint:** `POST /api/v1/register`

```json
{
  "workspace_id": "ws_12345",
  "metadata": {
    "name": "My Local Agent",
    "version": "1.0.0"
  }
}
```

**Response:**
```json
{
  "relay_id": "agt_abc123...",
  "api_key": "sk_...",
  "webhook_url": "https://relay.powerlobster.com/api/v1/webhook/agt_abc123..."
}
```

*   **`relay_id`**: Public identifier for the agent.
*   **`api_key`**: Secret key used to authenticate the WebSocket connection.
*   **`webhook_url`**: The URL you paste into PowerLobster (or other services) to send webhooks to this agent.

## Connection Protocol

Agents connect using standard WebSockets (`wss://`).

**Endpoint:** `wss://<relay-host>/api/v1/connect`

### Authentication Handshake

Immediately after connecting, the agent must send an authentication message:

```json
{
  "type": "auth",
  "relay_id": "agt_abc123...",
  "api_key": "sk_...",
  "version": "1.0.0"
}
```

If successful, the server responds:

```json
{
  "type": "auth_success",
  "relay_id": "agt_abc123...",
  "webhook_url": "...",
  "session_id": "...",
  "timestamp": 1678900000000
}
```

### Receiving Webhooks

The server pushes webhook events to the agent:

```json
{
  "type": "webhook",
  "id": "evt_unique_id",
  "timestamp": 1678900000000,
  "signature": "sha256=...",
  "payload": {
    "event": "message.received",
    "data": { ... }
  }
}
```

### Acknowledgment (ACK)

To ensure reliable delivery, the agent must acknowledge every webhook:

```json
{
  "type": "ack",
  "id": "evt_unique_id"
}
```

If an ACK is not received within 30 seconds, the server may queue the event for retry.

### Heartbeats

The server sends a `ping` every 30 seconds. The agent must respond with a `pong` to keep the connection alive.

## Using the SDKs

We provide official SDKs to handle the protocol details (connection, auth, ack, reconnects) for you.

### Node.js Agent

```bash
npm install @powerlobster/webhook
```

```javascript
const { WebhookRelay } = require('@powerlobster/webhook');

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: 'sk_...'
});

relay.on('webhook', async (event) => {
  console.log('Received:', event.payload);
  // Auto-ACKs when this function returns
});

relay.connect();
```

### Python Agent

```bash
pip install powerlobster-webhook
```

```python
from powerlobster_webhook import WebhookRelay

relay = WebhookRelay(
    relay_url="wss://relay.powerlobster.com",
    api_key="sk_..."
)

@relay.on_webhook
async def handle_webhook(event):
    print(f"Received: {event.payload}")

relay.connect()
```

## Security Best Practices

1.  **Keep API Keys Secret**: Never commit your `api_key` to version control. Use environment variables.
2.  **Verify Signatures**: If you are not using the SDKs, always verify the HMAC signature of the payload to ensure it came from PowerLobster.
3.  **TLS Only**: Always use `wss://` (secure WebSocket) for connections.
