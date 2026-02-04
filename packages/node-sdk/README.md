# @powerlobster/webhook

Official Node.js SDK for PowerLobster Webhook Relay.

## Installation

```bash
npm install @powerlobster/webhook
```

## Quick Start

```javascript
import { WebhookRelay } from '@powerlobster/webhook';

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: process.env.POWERLOBSTER_API_KEY
});

relay.on('webhook', async (event) => {
  console.log('Received:', event.payload);
});

relay.on('connected', (info) => {
  console.log('Webhook URL:', info.webhookUrl);
});

await relay.connect();
```

## API Reference

### Constructor

```typescript
new WebhookRelay(options: WebhookRelayOptions)
```

**Options:**
```typescript
interface WebhookRelayOptions {
  relayUrl: string;              // WebSocket relay URL
  apiKey: string;                // Agent API key
  autoReconnect?: boolean;       // Auto-reconnect on disconnect (default: true)
  reconnectDelay?: number;       // Delay between reconnects in ms (default: 5000)
  maxReconnectAttempts?: number; // Max reconnect attempts (default: Infinity)
  heartbeatInterval?: number;    // Heartbeat interval in ms (default: 30000)
  httpEndpoint?: string;         // Optional HTTP fallback endpoint
}
```

### Methods

#### `connect()`

Connect to the relay server.

```typescript
await relay.connect();
```

**Returns:** `Promise<void>`

#### `disconnect()`

Disconnect from the relay server.

```typescript
await relay.disconnect();
```

**Returns:** `Promise<void>`

#### `on(event, handler)`

Register event handler.

```typescript
relay.on('webhook', (event: WebhookEvent) => {
  // Handle webhook
});
```

**Events:**
- `connected` — Connected to relay
- `disconnected` — Disconnected from relay
- `webhook` — Received webhook event
- `error` — Error occurred
- `reconnecting` — Reconnecting to relay

### Event Types

```typescript
interface WebhookEvent {
  id: string;
  timestamp: number;
  signature: string;
  payload: {
    event: string;
    workspace_id: string;
    data: any;
  };
}

interface ConnectedEvent {
  webhookUrl: string;
  sessionId: string;
  timestamp: number;
}

interface DisconnectedEvent {
  reason: string;
  message?: string;
}

interface ReconnectingEvent {
  attempt: number;
}
```

## Examples

### Basic Usage

```javascript
import { WebhookRelay } from '@powerlobster/webhook';

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: 'sk_your_api_key'
});

relay.on('connected', (info) => {
  console.log('✅ Connected to relay');
  console.log('Configure PowerLobster webhook URL:', info.webhookUrl);
});

relay.on('webhook', async (event) => {
  if (event.payload.event === 'message.received') {
    const message = event.payload.data;
    console.log(`New message from ${message.sender}: ${message.text}`);
    
    // Process message...
    await handleMessage(message);
  }
});

relay.on('error', (error) => {
  console.error('Relay error:', error);
});

await relay.connect();
```

### With Manual Acknowledgment

```javascript
relay.on('webhook', async (event) => {
  try {
    await processWebhook(event.payload);
    // Auto-acknowledges on successful return
  } catch (error) {
    console.error('Processing failed:', error);
    return false; // Don't acknowledge (will retry)
  }
});
```

### With HTTP Fallback

```javascript
import express from 'express';

const app = express();
app.use(express.json());

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: 'sk_your_api_key',
  httpEndpoint: 'https://myagent.local/webhook'
});

// HTTP fallback endpoint (if WebSocket unavailable)
app.post('/webhook', (req, res) => {
  relay.handleHttpWebhook(req.body, req.headers);
  res.status(200).send({ status: 'received' });
});

app.listen(3000);
await relay.connect();
```

### Graceful Shutdown

```javascript
const relay = new WebhookRelay({ ... });

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await relay.disconnect();
  process.exit(0);
});

await relay.connect();
```

## TypeScript Support

Full TypeScript definitions included.

```typescript
import { WebhookRelay, WebhookEvent } from '@powerlobster/webhook';

const relay = new WebhookRelay({
  relayUrl: 'wss://relay.powerlobster.com',
  apiKey: process.env.POWERLOBSTER_API_KEY!
});

relay.on('webhook', (event: WebhookEvent) => {
  console.log(event.payload);
});
```

## Testing

```bash
npm test
```

## License

MIT
