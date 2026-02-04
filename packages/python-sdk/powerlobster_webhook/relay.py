"""PowerLobster Webhook Relay client."""

import asyncio
import json
import logging
import time
from typing import Any, Callable, Dict, Optional
import websockets
from websockets.client import WebSocketClientProtocol

from .types import (
    WebhookEvent,
    ConnectedEvent,
    DisconnectedEvent,
    ReconnectingEvent
)
from .utils.signature import verify_signature
from .utils.retry import exponential_backoff


class WebhookRelay:
    """
    PowerLobster Webhook Relay client.
    
    Example:
        >>> relay = WebhookRelay(
        ...     relay_url="wss://relay.powerlobster.com",
        ...     api_key="sk_your_api_key"
        ... )
        >>> 
        >>> @relay.on_webhook
        >>> async def handle_webhook(event):
        ...     print(f"Received: {event.payload}")
        >>> 
        >>> relay.connect()
    """
    
    def __init__(
        self,
        relay_url: str,
        api_key: str,
        auto_reconnect: bool = True,
        reconnect_delay: float = 5.0,
        max_reconnect_attempts: float = float('inf'),
        heartbeat_interval: float = 30.0,
        http_endpoint: Optional[str] = None,
        logger: Optional[logging.Logger] = None
    ):
        """
        Initialize WebhookRelay client.
        
        Args:
            relay_url: WebSocket relay URL (e.g., wss://relay.powerlobster.com)
            api_key: Agent API key (sk_...)
            auto_reconnect: Enable automatic reconnection (default: True)
            reconnect_delay: Base delay between reconnects in seconds (default: 5.0)
            max_reconnect_attempts: Max reconnection attempts (default: inf)
            heartbeat_interval: Heartbeat check interval in seconds (default: 30.0)
            http_endpoint: Optional HTTP fallback endpoint
            logger: Custom logger instance
        """
        if not relay_url:
            raise ValueError("relay_url is required")
        if not api_key:
            raise ValueError("api_key is required")
        
        self.relay_url = relay_url
        self.api_key = api_key
        self.auto_reconnect = auto_reconnect
        self.reconnect_delay = reconnect_delay
        self.max_reconnect_attempts = max_reconnect_attempts
        self.heartbeat_interval = heartbeat_interval
        self.http_endpoint = http_endpoint
        self.logger = logger or logging.getLogger(__name__)
        
        # State
        self._ws: Optional[WebSocketClientProtocol] = None
        self._connected = False
        self._reconnect_attempt = 0
        self._should_reconnect = True
        self._last_pong_time = 0.0
        self._webhook_url: Optional[str] = None
        self._session_id: Optional[str] = None
        
        # Event handlers
        self._webhook_handler: Optional[Callable] = None
        self._connected_handler: Optional[Callable] = None
        self._disconnected_handler: Optional[Callable] = None
        self._error_handler: Optional[Callable] = None
        self._reconnecting_handler: Optional[Callable] = None
        
        # Tasks
        self._receive_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
    
    def on_webhook(self, handler: Callable[[WebhookEvent], Any]):
        """
        Register webhook event handler (decorator).
        
        Example:
            >>> @relay.on_webhook
            >>> async def handle(event):
            ...     print(event.payload)
        """
        self._webhook_handler = handler
        return handler
    
    def on_connected(self, handler: Callable[[ConnectedEvent], None]):
        """Register connection event handler (decorator)."""
        self._connected_handler = handler
        return handler
    
    def on_disconnected(self, handler: Callable[[DisconnectedEvent], None]):
        """Register disconnection event handler (decorator)."""
        self._disconnected_handler = handler
        return handler
    
    def on_error(self, handler: Callable[[Exception], None]):
        """Register error event handler (decorator)."""
        self._error_handler = handler
        return handler
    
    def on_reconnecting(self, handler: Callable[[ReconnectingEvent], None]):
        """Register reconnecting event handler (decorator)."""
        self._reconnecting_handler = handler
        return handler
    
    def connect(self):
        """
        Connect to relay server (blocking).
        
        Blocks until disconnected or error occurs.
        """
        asyncio.run(self.connect_async())
    
    async def connect_async(self):
        """
        Connect to relay server (async).
        
        Returns when disconnected or error occurs.
        """
        try:
            await self._connect()
        except Exception as e:
            self.logger.error(f"Connection failed: {e}")
            if self._error_handler:
                self._error_handler(e)
            raise
    
    async def disconnect(self):
        """Disconnect from relay server."""
        self._should_reconnect = False
        
        # Cancel tasks
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass
        
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
        
        # Close WebSocket
        if self._ws:
            await self._ws.close()
            self._ws = None
        
        self._connected = False
        self.logger.info("Disconnected from relay")
    
    async def _connect(self):
        """Internal connect implementation."""
        self.logger.info(f"Connecting to relay: {self.relay_url}")
        
        try:
            # Connect WebSocket
            self._ws = await websockets.connect(self.relay_url)
            
            # Send authentication
            await self._send({
                "type": "auth",
                "relay_id": "",  # Will be provided by relay
                "api_key": self.api_key,
                "version": "1.0.0"
            })
            
            # Wait for auth response
            message = await self._ws.recv()
            await self._handle_message(json.loads(message))
            
            if not self._connected:
                raise ConnectionError("Authentication failed")
            
            # Start background tasks
            self._receive_task = asyncio.create_task(self._receive_loop())
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())
            
            # Wait for disconnect
            await self._receive_task
            
        except Exception as e:
            self.logger.error(f"Connection error: {e}")
            if self._error_handler:
                self._error_handler(e)
            
            # Auto-reconnect
            if self._should_reconnect and self.auto_reconnect:
                await self._reconnect()
    
    async def _receive_loop(self):
        """Receive messages from WebSocket."""
        try:
            async for message in self._ws:
                data = json.loads(message)
                await self._handle_message(data)
        except websockets.exceptions.ConnectionClosed as e:
            self.logger.info(f"Connection closed: {e}")
            self._connected = False
            
            event = DisconnectedEvent(
                reason="connection_closed",
                message=str(e)
            )
            if self._disconnected_handler:
                self._disconnected_handler(event)
            
            # Auto-reconnect
            if self._should_reconnect and self.auto_reconnect:
                await self._reconnect()
        except Exception as e:
            self.logger.error(f"Receive loop error: {e}")
            if self._error_handler:
                self._error_handler(e)
    
    async def _heartbeat_loop(self):
        """Monitor connection health via heartbeat."""
        timeout = self.heartbeat_interval * 3  # 3x heartbeat interval
        
        while self._connected:
            await asyncio.sleep(self.heartbeat_interval)
            
            now = time.time()
            time_since_pong = now - self._last_pong_time
            
            if time_since_pong > timeout:
                self.logger.warning("Heartbeat timeout, reconnecting...")
                if self._ws:
                    await self._ws.close()
                break
    
    async def _handle_message(self, message: Dict[str, Any]):
        """Handle incoming WebSocket message."""
        msg_type = message.get("type")
        
        if msg_type == "auth_success":
            await self._handle_auth_success(message)
        
        elif msg_type == "auth_error":
            await self._handle_auth_error(message)
        
        elif msg_type == "webhook":
            await self._handle_webhook(message)
        
        elif msg_type == "ping":
            await self._handle_ping(message)
        
        elif msg_type == "error":
            await self._handle_error(message)
        
        elif msg_type == "disconnect":
            await self._handle_disconnect(message)
        
        else:
            self.logger.warning(f"Unknown message type: {msg_type}")
    
    async def _handle_auth_success(self, message: Dict[str, Any]):
        """Handle successful authentication."""
        self._connected = True
        self._reconnect_attempt = 0
        self._webhook_url = message.get("webhook_url")
        self._session_id = message.get("session_id")
        self._last_pong_time = time.time()
        
        self.logger.info(f"Authentication successful (session: {self._session_id})")
        
        if self._connected_handler:
            event = ConnectedEvent(
                webhook_url=self._webhook_url,
                session_id=self._session_id,
                timestamp=message.get("timestamp", 0)
            )
            self._connected_handler(event)
    
    async def _handle_auth_error(self, message: Dict[str, Any]):
        """Handle authentication error."""
        error_msg = message.get("message", "Authentication failed")
        self.logger.error(f"Authentication error: {error_msg}")
        
        error = ConnectionError(error_msg)
        if self._error_handler:
            self._error_handler(error)
        
        raise error
    
    async def _handle_webhook(self, message: Dict[str, Any]):
        """Handle incoming webhook event."""
        try:
            event = WebhookEvent(
                id=message["id"],
                timestamp=message["timestamp"],
                signature=message["signature"],
                payload=message["payload"]
            )
            
            self.logger.debug(f"Received webhook: {event.id}")
            
            if not self._webhook_handler:
                self.logger.warning("No webhook handler registered")
                await self._acknowledge(event.id)
                return
            
            # Call user handler
            should_ack = True
            try:
                result = self._webhook_handler(event)
                
                # Handle async handler
                if asyncio.iscoroutine(result):
                    result = await result
                
                # Check if handler returned False
                if result is False:
                    should_ack = False
            
            except Exception as e:
                self.logger.error(f"Webhook handler error: {e}")
                if self._error_handler:
                    self._error_handler(e)
                should_ack = False  # Don't ack on error (will retry)
            
            # Auto-acknowledge
            if should_ack:
                await self._acknowledge(event.id)
        
        except Exception as e:
            self.logger.error(f"Failed to process webhook: {e}")
            if self._error_handler:
                self._error_handler(e)
    
    async def _handle_ping(self, message: Dict[str, Any]):
        """Handle ping (heartbeat)."""
        self._last_pong_time = time.time()
        
        # Respond with pong
        await self._send({
            "type": "pong",
            "timestamp": int(time.time() * 1000)
        })
    
    async def _handle_error(self, message: Dict[str, Any]):
        """Handle error message from server."""
        error_msg = message.get("message", "Server error")
        self.logger.error(f"Server error: {error_msg}")
        
        error = Exception(error_msg)
        if self._error_handler:
            self._error_handler(error)
    
    async def _handle_disconnect(self, message: Dict[str, Any]):
        """Handle graceful disconnect from server."""
        reason = message.get("reason", "unknown")
        msg = message.get("message")
        reconnect_after = message.get("reconnect_after_ms")
        
        self.logger.warning(f"Server requested disconnect: {reason}")
        
        event = DisconnectedEvent(
            reason=reason,
            message=msg,
            reconnect_after_ms=reconnect_after
        )
        
        if self._disconnected_handler:
            self._disconnected_handler(event)
        
        # Reconnect after delay if requested
        if reconnect_after and self.auto_reconnect:
            await asyncio.sleep(reconnect_after / 1000)
            await self._reconnect()
    
    async def _reconnect(self):
        """Reconnect with exponential backoff."""
        if self._reconnect_attempt >= self.max_reconnect_attempts:
            error = Exception("Max reconnect attempts reached")
            self.logger.error(str(error))
            if self._error_handler:
                self._error_handler(error)
            return
        
        self._reconnect_attempt += 1
        delay = exponential_backoff(self._reconnect_attempt, self.reconnect_delay)
        
        self.logger.info(
            f"Reconnecting in {delay:.1f}s... "
            f"(attempt {self._reconnect_attempt}/{self.max_reconnect_attempts})"
        )
        
        if self._reconnecting_handler:
            event = ReconnectingEvent(
                attempt=self._reconnect_attempt,
                max_attempts=self.max_reconnect_attempts,
                next_retry_ms=int(delay * 1000)
            )
            self._reconnecting_handler(event)
        
        await asyncio.sleep(delay)
        await self._connect()
    
    async def _acknowledge(self, event_id: str):
        """Send acknowledgment for webhook event."""
        await self._send({
            "type": "ack",
            "id": event_id,
            "timestamp": int(time.time() * 1000)
        })
    
    async def _send(self, message: Dict[str, Any]):
        """Send message to server."""
        if not self._ws:
            self.logger.warning("Cannot send message: not connected")
            return
        
        await self._ws.send(json.dumps(message))
    
    def handle_http_webhook(self, payload: Dict[str, Any], headers: Dict[str, str]) -> bool:
        """
        Handle HTTP webhook (fallback mode).
        
        Args:
            payload: Webhook payload
            headers: HTTP headers
        
        Returns:
            True if webhook was valid and processed
        """
        signature = headers.get("x-relay-signature")
        timestamp = headers.get("x-relay-timestamp")
        
        if not verify_signature(payload, timestamp, signature, self.api_key):
            self.logger.warning("Invalid HTTP webhook signature")
            return False
        
        # Create event
        event = WebhookEvent(
            id=payload.get("id", ""),
            timestamp=int(timestamp),
            signature=signature,
            payload=payload.get("payload", {})
        )
        
        # Call handler
        if self._webhook_handler:
            try:
                result = self._webhook_handler(event)
                if asyncio.iscoroutine(result):
                    asyncio.run(result)
            except Exception as e:
                self.logger.error(f"HTTP webhook handler error: {e}")
                return False
        
        return True
