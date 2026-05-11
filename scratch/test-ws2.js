const WebSocket = require('ws');

const ws = new WebSocket('ws://69.197.178.27/ws/feed');

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'XAUUSD'] }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type !== 'tick') {
    console.log('Message:', JSON.stringify(msg));
  }
});

ws.on('error', (err) => {
  console.error('Error:', err);
});

setTimeout(() => {
  ws.close();
}, 10000);
