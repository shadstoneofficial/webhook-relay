"""
Basic Python example for PowerLobster Webhook Relay

This is a minimal working example showing how to:
- Connect to the relay
- Receive webhook events
- Handle graceful shutdown
"""

import os
import signal
import asyncio
from powerlobster_webhook import WebhookRelay, WebhookEvent
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


# Initialize relay
relay = WebhookRelay(
    relay_url=os.getenv("RELAY_URL", "wss://relay.powerlobster.com"),
    api_key=os.getenv("POWERLOBSTER_API_KEY")
)


# Handle webhook events
@relay.on_webhook
async def handle_webhook(event: WebhookEvent):
    print(f"📬 Received webhook: {event.id}")
    print(f"   Type: {event.payload['event']}")
    print(f"   Timestamp: {event.timestamp}")
    
    # Process event based on type
    event_type = event.payload["event"]
    
    if event_type == "message.received":
        await handle_message_received(event.payload["data"])
    else:
        print(f"   Unknown event type: {event_type}")


# Handle connection events
@relay.on_connected
def on_connected(info):
    print("✅ Connected to PowerLobster relay")
    print("📋 Configure this webhook URL in PowerLobster dashboard:")
    print(f"   {info.webhook_url}")
    print()


@relay.on_disconnected
def on_disconnected(info):
    print(f"🔌 Disconnected: {info.reason}")


@relay.on_reconnecting
def on_reconnecting(info):
    print(f"🔄 Reconnecting (attempt {info.attempt})...")


@relay.on_error
def on_error(error):
    print(f"❌ Error: {error}")


# Message handler
async def handle_message_received(message_data):
    message_id = message_data.get("message_id")
    text = message_data.get("text")
    sender = message_data.get("sender", {})
    
    print(f"New message from {sender.get('name')}: \"{text}\"")
    
    # Your message processing logic here
    # Example: Echo back the message
    # await send_response(message_data["conversation_id"], f"Echo: {text}")


# Graceful shutdown
def signal_handler(sig, frame):
    print("\nShutting down...")
    asyncio.create_task(relay.disconnect())


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


# Start
if __name__ == "__main__":
    print("🦞 Starting PowerLobster webhook relay...")
    
    try:
        relay.connect()
    except Exception as e:
        print(f"Failed to connect: {e}")
        exit(1)
