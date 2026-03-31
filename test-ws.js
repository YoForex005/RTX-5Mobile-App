const WebSocket = require('ws');

const ws = new WebSocket('ws://69.197.178.27/ws/feed');

ws.on('open', () => {
    console.log('Connected!');
    ws.send(JSON.stringify({ type: 'ping' }));
    
    setTimeout(() => {
        ws.send(JSON.stringify({ type: 'ping' }));
    }, 2000);

    setTimeout(() => {
        ws.close();
    }, 5000);
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
});

ws.on('error', (err) => console.error(err));
ws.on('close', () => console.log('Closed.'));
