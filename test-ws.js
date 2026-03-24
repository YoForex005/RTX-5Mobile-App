const WebSocket = require('ws');

const ws = new WebSocket('ws://69.197.178.27/ws/feed');

ws.on('open', () => {
  console.log('Connected to WS');
  const msg = { type: 'subscribe_candles', symbol: 'XAUUSD', tf: '1m' };
  console.log('Sending:', msg);
  ws.send(JSON.stringify(msg));
});

ws.on('message', (data) => {
  console.log('Received payload:', data.toString());
  // close after first message to not hang
  setTimeout(() => process.exit(0), 1000);
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
  process.exit(1);
});

// timeout just in case it hangs
setTimeout(() => {
  console.log('Timeout reached');
  process.exit(0);
}, 5000);
