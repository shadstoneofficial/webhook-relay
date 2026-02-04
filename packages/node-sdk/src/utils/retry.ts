export function exponentialBackoff(attempt: number, baseDelay: number = 1000): number {
  const maxDelay = 30000; // 30 seconds max
  const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  
  return Math.floor(delay + jitter);
}
