# Basic Node.js Example

Minimal working example of PowerLobster Webhook Relay integration.

## Prerequisites

- Node.js 18+ installed
- PowerLobster API key

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your POWERLOBSTER_API_KEY
   ```

3. **Run the example:**
   ```bash
   npm start
   ```

4. **Copy webhook URL:**
   - The console will display a webhook URL
   - Copy it and paste into your PowerLobster dashboard under **Settings → Webhooks**

5. **Test it:**
   - Send a test message in PowerLobster
   - You should see the webhook event logged in your console

## What's Included

- ✅ Basic webhook relay connection
- ✅ Event handling (message.received)
- ✅ Automatic reconnection
- ✅ Graceful shutdown
- ✅ Error handling

## Customization

### Add More Event Handlers

```javascript
relay.on('webhook', async (event) => {
  switch (event.payload.event) {
    case 'message.received':
      await handleMessageReceived(event.payload.data);
      break;
    
    case 'conversation.created':
      await handleConversationCreated(event.payload.data);
      break;
    
    // Add more event types here
  }
});
```

### Send Responses Back to PowerLobster

```javascript
const axios = require('axios');

async function sendMessage(conversationId, text) {
  const response = await axios.post(
    `https://api.powerlobster.com/v1/conversations/${conversationId}/messages`,
    { text },
    {
      headers: {
        'Authorization': `Bearer ${process.env.POWERLOBSTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}
```

## Development

Run with auto-reload:
```bash
npm run dev
```

## Production

For production deployments, use a process manager:

**PM2:**
```bash
npm install -g pm2
pm2 start index.js --name powerlobster-webhook
pm2 save
pm2 startup
```

**Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "index.js"]
```

## Troubleshooting

**"Failed to connect" error:**
- Check your API key is correct
- Verify internet connection
- Check relay service status

**"No webhook events received":**
- Ensure webhook URL is configured in PowerLobster dashboard
- Check PowerLobster workspace has events enabled
- Verify API key has webhook permissions

## Next Steps

- See [Clawdbot integration example](../clawdbot-integration/) for advanced usage
- Read [API reference](../../docs/api-reference.md) for full documentation
- Check [security best practices](../../docs/security.md)

## License

MIT
