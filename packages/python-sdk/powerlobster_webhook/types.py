"""Type definitions for PowerLobster Webhook SDK."""

from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol
import logging


@dataclass
class WebhookEvent:
    """Webhook event from PowerLobster."""
    id: str
    timestamp: int
    signature: str
    payload: Dict[str, Any]


@dataclass
class ConnectedEvent:
    """Connection success event."""
    webhook_url: str
    session_id: str
    timestamp: int


@dataclass
class DisconnectedEvent:
    """Disconnection event."""
    reason: str
    message: Optional[str] = None
    reconnect_after_ms: Optional[int] = None


@dataclass
class ReconnectingEvent:
    """Reconnection attempt event."""
    attempt: int
    max_attempts: float
    next_retry_ms: int


class Logger(Protocol):
    """Logger protocol."""
    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None: ...
    def info(self, msg: str, *args: Any, **kwargs: Any) -> None: ...
    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None: ...
    def error(self, msg: str, *args: Any, **kwargs: Any) -> None: ...
