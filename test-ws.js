const ws = new WebSocket('ws://69.197.178.27/ws/feed');

ws.onopen = function () {
  console.log('Connected to ws://69.197.178.27/ws/feed');
  const msg = {"type":"subscribe","symbols":["EURUSD","GBPUSD","USDJPY","XAUUSD","BTCUSD","ETHUSD","USOIL"]};
  ws.send(JSON.stringify(msg));
  console.log('Sent:', msg);
};

ws.onmessage = function (event) {
  console.log('Received payload type:', typeof event.data);
  console.log('Received:', event.data.toString());
};

ws.onerror = function (error) {
  console.error('Error:', error);
};

// close after 30s
setTimeout(() => { ws.close(); process.exit(0); }, 30000);
