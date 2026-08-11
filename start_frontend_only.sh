#!/bin/bash
echo "Starting local Frontend Proxy..."

if [ ! -f proxy-server.js ]; then
cat << 'EOF' > proxy-server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

// Phục vụ giao diện (index.html) tại route gốc
app.use(express.static(path.join(__dirname, 'frontend')));

// Phục vụ các file tĩnh (app.js, style.css) khi index.html gọi /static/...
app.use('/static', express.static(path.join(__dirname, 'frontend')));

// Remote Nginx Server that hosts the backends
const REMOTE_API = 'http://10.61.200.10:9999';

const apiProxy = createProxyMiddleware({ 
    target: REMOTE_API, 
    changeOrigin: true,
    onError: (err, req, res) => {
        console.error("Proxy Error:", err);
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Proxy Error: ' + err.message);
    }
});

app.use('/api', apiProxy);

app.listen(9999, () => {
    console.log('----------------------------------------------------');
    console.log(`Frontend running on http://localhost:9999`);
    console.log(`Proxying API requests to ${REMOTE_API}`);
    console.log('----------------------------------------------------');
});
EOF
fi

if [ ! -f package.json ]; then
    npm init -y
fi
npm install express http-proxy-middleware

node proxy-server.js &
PROXY_PID=$!

echo "Frontend proxy started! Press Ctrl+C to stop."

trap "echo 'Stopping proxy...'; kill $PROXY_PID 2>/dev/null; exit" INT TERM EXIT

wait
