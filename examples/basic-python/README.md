# Basic Python Example

Minimal working example of PowerLobster Webhook Relay integration for Python.

## Prerequisites

- Python 3.8+ installed
- PowerLobster API key

## Quick Start

1. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your POWERLOBSTER_API_KEY
   ```

4. **Run the example:**
   ```bash
   python main.py
   ```

5. **Copy webhook URL:**
   - The console will display a webhook URL
   - Copy it and paste into your PowerLobster dashboard under **Settings → Webhooks**

6. **Test it:**
   - Send a test message in PowerLobster
   - You should see the webhook event logged in your console

## What's Included

- ✅ Basic webhook relay connection
- ✅ Event handling (message.received)
- ✅ Automatic reconnection
- ✅ Graceful shutdown
- ✅ Error handling
- ✅ Type hints for better IDE support

## Customization

### Add More Event Handlers

```python
@relay.on_webhook
async def handle_webhook(event: WebhookEvent):
    event_type = event.payload["event"]
    
    if event_type == "message.received":
        await handle_message_received(event.payload["data"])
    
    elif event_type == "conversation.created":
        await handle_conversation_created(event.payload["data"])
    
    # Add more event types here
```

### Send Responses Back to PowerLobster

```python
import httpx

async def send_message(conversation_id: str, text: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.powerlobster.com/v1/conversations/{conversation_id}/messages",
            json={"text": text},
            headers={
                "Authorization": f"Bearer {os.getenv('POWERLOBSTER_API_KEY')}",
                "Content-Type": "application/json"
            }
        )
        response.raise_for_status()
        return response.json()
```

### Async Usage (Non-Blocking)

```python
import asyncio

async def main():
    relay = WebhookRelay(
        relay_url=os.getenv("RELAY_URL", "wss://relay.powerlobster.com"),
        api_key=os.getenv("POWERLOBSTER_API_KEY")
    )
    
    @relay.on_webhook
    async def handle_webhook(event):
        print(f"Received: {event.payload}")
    
    # Connect (non-blocking)
    await relay.connect_async()

if __name__ == "__main__":
    asyncio.run(main())
```

## Production

For production deployments, use a process manager:

**systemd service:**

```ini
# /etc/systemd/system/powerlobster-webhook.service
[Unit]
Description=PowerLobster Webhook Relay
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/powerlobster-webhook
Environment="PATH=/opt/powerlobster-webhook/venv/bin"
ExecStart=/opt/powerlobster-webhook/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable powerlobster-webhook
sudo systemctl start powerlobster-webhook
sudo systemctl status powerlobster-webhook
```

**Docker:**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

Build and run:
```bash
docker build -t powerlobster-webhook .
docker run -d --name webhook --env-file .env powerlobster-webhook
```

**Supervisor:**

```ini
[program:powerlobster-webhook]
command=/path/to/venv/bin/python /path/to/main.py
directory=/path/to/app
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/powerlobster-webhook.err.log
stdout_logfile=/var/log/powerlobster-webhook.out.log
```

## Troubleshooting

**"Failed to connect" error:**
- Check your API key is correct in `.env`
- Verify internet connection
- Check relay service status
- Ensure Python 3.8+ is installed: `python --version`

**"No webhook events received":**
- Ensure webhook URL is configured in PowerLobster dashboard
- Check PowerLobster workspace has events enabled
- Verify API key has webhook permissions
- Check firewall allows WebSocket connections

**"ModuleNotFoundError":**
- Ensure virtual environment is activated: `source venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`

## Type Checking

Run type checking with mypy:
```bash
pip install mypy
mypy main.py
```

## Logging

Add structured logging:
```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

relay = WebhookRelay(
    relay_url=os.getenv("RELAY_URL"),
    api_key=os.getenv("POWERLOBSTER_API_KEY"),
    logger=logging.getLogger("powerlobster")
)
```

## Next Steps

- See [Clawdbot integration example](../clawdbot-integration/) for advanced usage
- Read [API reference](../../docs/api-reference.md) for full documentation
- Check [security best practices](../../docs/security.md)

## License

MIT
