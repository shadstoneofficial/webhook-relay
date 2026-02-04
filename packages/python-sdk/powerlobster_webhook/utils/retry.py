"""Retry utilities with exponential backoff."""

import random


def exponential_backoff(attempt: int, base_delay: float = 1.0) -> float:
    """
    Calculate exponential backoff delay with jitter.
    
    Args:
        attempt: Retry attempt number (1-indexed)
        base_delay: Base delay in seconds
    
    Returns:
        Delay in seconds
    """
    max_delay = 30.0  # 30 seconds max
    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
    
    # Add jitter (±20%)
    jitter = delay * 0.2 * (random.random() - 0.5)
    
    return delay + jitter
