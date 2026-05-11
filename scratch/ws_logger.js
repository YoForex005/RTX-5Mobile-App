const WebSocket = require('ws');

const ws = new WebSocket('wss://backend.orrnn.com/ws/feed');

ws.on('open', () => {
  console.log('Connected to wss://backend.orrnn.com/ws/feed');
  ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD'] }));
  console.log('Sent subscription for EURUSD');
});

let messageCount = 0;
ws.on('message', (data) => {
  console.log('\n--- WEBSOCKET PAYLOAD RECEIVED ---');
  console.log(data.toString());
  messageCount++;
  
  if (messageCount >= 3) {
    console.log('\nClosing connection after 3 messages.');
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
});

ws.on('close', () => {
  console.log('WS Connection closed');
});
