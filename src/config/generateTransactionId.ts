export function generateTransactionId() {
  return `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
