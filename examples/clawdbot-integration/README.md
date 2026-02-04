# Clawdbot Integration Example

Example integration of PowerLobster Webhook Relay with Clawdbot agents.

## Overview

This example shows how to integrate the webhook relay into a Clawdbot agent to receive real-time PowerLobster notifications without requiring a public IP address or server.

## Features

- ✅ Real-time message notifications via WebSocket
- ✅ Automatic reconnection on network issues
- ✅ Graceful shutdown handling
- ✅ Structured logging
- ✅ Error recovery

## Installation

```bash
npm install @powerlobster/webhook
# or
yarn add @powerlobster/webhook
```

## Configuration

Create a `.env` file:

```bash
# PowerLobster API credentials
POWERLOBSTER_API_KEY=sk_your_api_key
POWERLOBSTER_WORKSPACE_ID=ws_your_workspace_id

# Relay configuration
RELAY_URL=wss://relay.powerlobster.com
# Or self-hosted:
# RELAY_URL=wss://your-relay.example.com

# Clawdbot configuration
CLAWDBOT_AGENT_ID=agent_clawdbot_123
```

## Usage

### Basic Integration

```javascript
// clawdbot-webhook-handler.js
import { WebhookRelay } from '@powerlobster/webhook';
import { logger } from './utils/logger';
import { handleMessage } from './handlers/message';

const relay = new WebhookRelay({
  relayUrl: process.env.RELAY_URL,
  apiKey: process.env.POWERLOBSTER_API_KEY,
  logger: logger
});

// Handle webhook events
relay.on('webhook', async (event) => {
  const { event: eventType, data } = event.payload;
  
  logger.info('Received webhook event', { 
    eventId: event.id,
    eventType 
  });
  
  switch (eventType) {
    case 'message.received':
      await handleMessage(data);
      break;
    
    case 'message.updated':
      await handleMessageUpdate(data);
      break;
    
    case 'conversation.created':
      await handleConversationCreated(data);
      break;
    
    default:
      logger.warn('Unknown event type', { eventType });
  }
});

// Connection lifecycle
relay.on('connected', (info) => {
  logger.info('✅ Connected to PowerLobster relay', {
    webhookUrl: info.webhookUrl,
    sessionId: info.sessionId
  });
  
  // Store webhook URL for configuration
  console.log('\n📋 Configure this webhook URL in PowerLobster:');
  console.log(`   ${info.webhookUrl}\n`);
});

relay.on('disconnected', (event) => {
  logger.warn('🔌 Disconnected from relay', { reason: event.reason });
});

relay.on('reconnecting', (event) => {
  logger.info('🔄 Reconnecting to relay...', { 
    attempt: event.attempt,
    nextRetryMs: event.nextRetryMs 
  });
});

relay.on('error', (error) => {
  logger.error('❌ Relay error', { error: error.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await relay.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await relay.disconnect();
  process.exit(0);
});

// Start relay
export async function startWebhookRelay() {
  try {
    await relay.connect();
  } catch (error) {
    logger.error('Failed to start webhook relay', { error });
    process.exit(1);
  }
}
```

### Message Handler

```javascript
// handlers/message.js
import { logger } from '../utils/logger';
import { processWithClawdbot } from '../clawdbot/processor';

export async function handleMessage(messageData) {
  const { message_id, conversation_id, text, sender, timestamp } = messageData;
  
  logger.info('Processing new message', {
    messageId: message_id,
    conversationId: conversation_id,
    sender: sender.name
  });
  
  try {
    // Process message with Clawdbot
    const response = await processWithClawdbot({
      conversationId: conversation_id,
      message: {
        id: message_id,
        text,
        sender,
        timestamp
      }
    });
    
    // Send response back to PowerLobster
    if (response) {
      await sendMessageToPowerLobster(conversation_id, response);
    }
    
    logger.info('Message processed successfully', { 
      messageId: message_id 
    });
    
  } catch (error) {
    logger.error('Failed to process message', {
      messageId: message_id,
      error: error.message
    });
    throw error; // Will trigger retry
  }
}

async function sendMessageToPowerLobster(conversationId, text) {
  // Use PowerLobster API to send response
  const response = await fetch(
    `https://api.powerlobster.com/v1/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.POWERLOBSTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    }
  );
  
  if (!response.ok) {
    throw new Error(`PowerLobster API error: ${response.statusText}`);
  }
  
  return response.json();
}
```

### Integration with Clawdbot Main Loop

```javascript
// index.js
import { startWebhookRelay } from './clawdbot-webhook-handler';
import { logger } from './utils/logger';

async function main() {
  logger.info('Starting Clawdbot with PowerLobster webhook relay...');
  
  // Initialize Clawdbot components
  await initializeClawdbot();
  
  // Start webhook relay (non-blocking)
  startWebhookRelay().catch((error) => {
    logger.error('Webhook relay crashed', { error });
    process.exit(1);
  });
  
  // Continue with Clawdbot main loop
  await runClawdbotMainLoop();
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
```

## Advanced: Rate Limiting

```javascript
import { WebhookRelay } from '@powerlobster/webhook';
import pLimit from 'p-limit';

// Limit concurrent message processing
const limit = pLimit(5); // Max 5 concurrent messages

const relay = new WebhookRelay({ ... });

relay.on('webhook', async (event) => {
  // Queue message processing with concurrency limit
  await limit(() => handleMessage(event.payload.data));
});
```

## Advanced: Webhook Filtering

```javascript
// Only process specific event types
const ALLOWED_EVENTS = new Set([
  'message.received',
  'message.updated'
]);

relay.on('webhook', async (event) => {
  const eventType = event.payload.event;
  
  if (!ALLOWED_EVENTS.has(eventType)) {
    logger.debug('Ignoring event', { eventType });
    return; // Auto-acknowledge but don't process
  }
  
  await handleEvent(event);
});
```

## Advanced: Metrics & Monitoring

```javascript
import { Counter, Histogram } from 'prom-client';

// Prometheus metrics
const webhookCounter = new Counter({
  name: 'powerlobster_webhooks_total',
  help: 'Total webhooks received',
  labelNames: ['event_type', 'status']
});

const webhookDuration = new Histogram({
  name: 'powerlobster_webhook_duration_seconds',
  help: 'Webhook processing duration',
  labelNames: ['event_type']
});

relay.on('webhook', async (event) => {
  const timer = webhookDuration.startTimer({ 
    event_type: event.payload.event 
  });
  
  try {
    await handleEvent(event);
    webhookCounter.inc({ 
      event_type: event.payload.event, 
      status: 'success' 
    });
  } catch (error) {
    webhookCounter.inc({ 
      event_type: event.payload.event, 
      status: 'error' 
    });
    throw error;
  } finally {
    timer();
  }
});
```

## Testing

### Mock Webhook Events

```javascript
// test/webhook-handler.test.js
import { handleMessage } from '../handlers/message';

describe('Webhook Handler', () => {
  it('should process message.received event', async () => {
    const mockEvent = {
      id: 'evt_test123',
      timestamp: Date.now(),
      signature: 'sha256=...',
      payload: {
        event: 'message.received',
        workspace_id: 'ws_test',
        data: {
          message_id: 'msg_123',
          conversation_id: 'conv_456',
          text: 'Hello Clawdbot!',
          sender: {
            id: 'user_789',
            name: 'Test User'
          },
          timestamp: Date.now()
        }
      }
    };
    
    await handleMessage(mockEvent.payload.data);
    
    // Assert message was processed correctly
    // ...
  });
});
```

## Troubleshooting

### Webhook Not Receiving Events

1. Check webhook URL is configured in PowerLobster dashboard
2. Verify API key is correct
3. Check relay server is running (if self-hosted)
4. Check network connectivity: `wscat -c wss://relay.powerlobster.com/api/v1/connect`

### Connection Drops Frequently

- Increase heartbeat interval: `heartbeatInterval: 60000` (60 seconds)
- Check network stability
- Verify firewall allows WebSocket connections

### High Memory Usage

- Limit concurrent message processing (see Rate Limiting example)
- Check for memory leaks in message handlers
- Monitor with `node --inspect`

## Production Checklist

- [ ] Environment variables configured
- [ ] Webhook URL registered in PowerLobster
- [ ] Error logging enabled
- [ ] Graceful shutdown handlers registered
- [ ] Rate limiting configured
- [ ] Monitoring/metrics enabled
- [ ] Health checks implemented
- [ ] Process manager configured (PM2, systemd)

## Resources

- [PowerLobster API Docs](https://docs.powerlobster.com)
- [Webhook Relay Documentation](../../docs/api-reference.md)
- [Clawdbot Documentation](https://docs.clawdbot.com)

## License

MIT
