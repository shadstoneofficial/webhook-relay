# powerlobster-webhook

Official Python SDK for PowerLobster Webhook Relay.

## Installation

```bash
pip install powerlobster-webhook
```

## Quick Start

```python
from powerlobster_webhook import WebhookRelay

relay = WebhookRelay(
    relay_url="wss://relay.powerlobster.com",
    api_key="sk_your_api_key"
)

@relay.on_webhook
async def handle_webhook(event):
    print(f"Received: {event.payload}")

@relay.on_connected
def on_connected(info):
    print(f"Webhook URL: {info.webhook_url}")

relay.connect()  # Blocks until disconnected
```

## API Reference

### Constructor

```python
WebhookRelay(
    relay_url: str,
    api_key: str,
    auto_reconnect: bool = True,
    reconnect_delay: float = 5.0,
    max_reconnect_attempts: int = float('inf'),
    heartbeat_interval: float = 30.0,
    http_endpoint: str = None,
    logger: logging.Logger = None
)
```

**Parameters:**
- `relay_url` (str): WebSocket relay URL
- `api_key` (str): Agent API key
- `auto_reconnect` (bool): Auto-reconnect on disconnect (default: True)
- `reconnect_delay` (float): Delay between reconnects in seconds (default: 5.0)
- `max_reconnect_attempts` (int): Max reconnect attempts (default: Infinity)
- `heartbeat_interval` (float): Heartbeat interval in seconds (default: 30.0)
- `http_endpoint` (str): Optional HTTP fallback endpoint
- `logger` (logging.Logger): Custom logger instance

### Methods

#### `connect()`

Connect to the relay server (blocking).

```python
relay.connect()
```

#### `disconnect()`

Disconnect from the relay server.

```python
relay.disconnect()
```

#### `connect_async()`

Connect to the relay server (async).

```python
await relay.connect_async()
```

### Decorators

#### `@relay.on_webhook`

Register webhook event handler.

```python
@relay.on_webhook
async def handle_webhook(event: WebhookEvent):
    # Handle webhook
    pass
```

**Event Type:**
```python
class WebhookEvent:
    id: str
    timestamp: int
    signature: str
    payload: dict  # {"event": str, "workspace_id": str, "data": dict}
```

#### `@relay.on_connected`

Register connection handler.

```python
@relay.on_connected
def on_connected(info: ConnectedEvent):
    print(f"Connected! Webhook URL: {info.webhook_url}")
```

**Event Type:**
```python
class ConnectedEvent:
    webhook_url: str
    session_id: str
    timestamp: int
```

#### `@relay.on_disconnected`

Register disconnection handler.

```python
@relay.on_disconnected
def on_disconnected(info: DisconnectedEvent):
    print(f"Disconnected: {info.reason}")
```

#### `@relay.on_error`

Register error handler.

```python
@relay.on_error
def on_error(error: Exception):
    print(f"Error: {error}")
```

#### `@relay.on_reconnecting`

Register reconnecting handler.

```python
@relay.on_reconnecting
def on_reconnecting(info: ReconnectingEvent):
    print(f"Reconnecting (attempt {info.attempt})...")
```

## Examples

### Basic Usage

```python
import asyncio
from powerlobster_webhook import WebhookRelay

relay = WebhookRelay(
    relay_url="wss://relay.powerlobster.com",
    api_key="sk_your_api_key"
)

@relay.on_webhook
async def handle_webhook(event):
    if event.payload["event"] == "message.received":
        message = event.payload["data"]
        print(f"New message from {message['sender']}: {message['text']}")
        
        # Process message...
        await process_message(message)

@relay.on_connected
def on_connected(info):
    print(f"✅ Connected to relay")
    print(f"Configure PowerLobster webhook URL: {info.webhook_url}")

@relay.on_error
def on_error(error):
    print(f"❌ Error: {error}")

# Connect (blocks until disconnected)
relay.connect()
```

### Async Usage

```python
import asyncio
from powerlobster_webhook import WebhookRelay

async def main():
    relay = WebhookRelay(
        relay_url="wss://relay.powerlobster.com",
        api_key="sk_your_api_key"
    )
    
    @relay.on_webhook
    async def handle_webhook(event):
        print(f"Received: {event.payload}")
    
    await relay.connect_async()

asyncio.run(main())
```

### With Manual Acknowledgment

```python
@relay.on_webhook
async def handle_webhook(event):
    try:
        await process_webhook(event.payload)
        # Auto-acknowledges on successful return
    except Exception as e:
        print(f"Processing failed: {e}")
        return False  # Don't acknowledge (will retry)
```

### Graceful Shutdown

```python
import signal
from powerlobster_webhook import WebhookRelay

relay = WebhookRelay(...)

def signal_handler(sig, frame):
    print("Shutting down...")
    relay.disconnect()

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

relay.connect()
```

## Type Hints

Full type hint support for better IDE completion.

```python
from powerlobster_webhook import (
    WebhookRelay,
    WebhookEvent,
    ConnectedEvent,
    DisconnectedEvent,
    ReconnectingEvent
)

relay = WebhookRelay(relay_url="...", api_key="...")

@relay.on_webhook
async def handle(event: WebhookEvent) -> None:
    ...
```

## Testing

```bash
pytest
```

## License

MIT
