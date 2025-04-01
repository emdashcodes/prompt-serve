/**
 * Log messages in JSON-RPC 2.0 format for Claude Desktop compatibility
 */
export function log(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
  // Use notification format (no id required) for logging
  const jsonRpcMessage = {
    jsonrpc: '2.0',
    method: 'log',
    params: {
      type,
      message
    }
  };
  console.log(JSON.stringify(jsonRpcMessage));
}