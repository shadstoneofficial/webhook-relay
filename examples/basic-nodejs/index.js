/**
 * Basic Node.js example for PowerLobster Webhook Relay
 * 
 * This is a minimal working example showing how to:
 * - Connect to the relay
 * - Receive webhook events
 * - Handle graceful shutdown
 */

const { WebhookRelay } = require('@powerlobster/webhook');
require('dotenv').config();

// Initialize relay
const relay = new WebhookRelay({
  relayUrl: process.env.RELAY_URL || 'wss://relay.powerlobster.com',
  apiKey: process.env.POWERLOBSTER_API_KEY
});

// Handle webhook events
relay.on('webhook', async (event) => {
  console.log('📬 Received webhook:', {
    id: event.id,
    type: event.payload.event,
    timestamp: new Date(event.timestamp).toISOString()
  });
  
  // Process event based on type
  switch (event.payload.event) {
    case 'message.received':
      await handleMessageReceived(event.payload.data);
      break;
    
    default:
      console.log('Unknown event type:', event.payload.event);
  }
});

// Handle connection events
relay.on('connected', (info) => {
  console.log('✅ Connected to PowerLobster relay');
  console.log('📋 Configure this webhook URL in PowerLobster dashboard:');
  console.log(`   ${info.webhookUrl}`);
  console.log('');
});

relay.on('disconnected', (event) => {
  console.log('🔌 Disconnected:', event.reason);
});

relay.on('reconnecting', (event) => {
  console.log(`🔄 Reconnecting (attempt ${event.attempt})...`);
});

relay.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

// Message handler
async function handleMessageReceived(messageData) {
  const { message_id, text, sender } = messageData;
  
  console.log(`New message from ${sender.name}: "${text}"`);
  
  // Your message processing logic here
  // Example: Echo back the message
  // await sendResponse(messageData.conversation_id, `Echo: ${text}`);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await relay.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await relay.disconnect();
  process.exit(0);
});

// Start
console.log('🦞 Starting PowerLobster webhook relay...');
relay.connect().catch((error) => {
  console.error('Failed to connect:', error);
  process.exit(1);
});
