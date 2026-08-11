#!/bin/bash
echo "Starting local environment (Backends + Frontend)..."

# 1. Start Python Backend
echo "Setting up Crawler Backend..."
cd crawler-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export DB_SERVER=10.61.200.10
export DB_PORT=1433
export DB_USER=sa
export DB_PASSWORD=Sadmin123
export DB_NAME=caw_powerbi_db
export PORT=8000
export TZ=Asia/Ho_Chi_Minh
export DINHVI_BACKEND_URL=http://127.0.0.1:5000
python3 main.py &
CRAWLER_PID=$!
cd ..

# 2. Start Node.js Backend
echo "Setting up Dinhvi Backend..."
cd dinhvi-backend
npm install
export PORT=5000
export JWT_SECRET=vnpost-excel-exporter-jwt-secret-key-2026-dynamic-secure
export DB_HOST=10.61.200.10
export DB_PORT=1433
export DB_USER=sa
export DB_PASSWORD=Sadmin123
export DB_NAME=caw_powerbi_db
node server.js &
DINHVI_PID=$!
cd ..

# 3. Setup and start Proxy Server (Frontend)
echo "Setting up Frontend Proxy..."
if [ ! -f proxy-server.js ]; then
cat << 'EOF' > proxy-server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/static', express.static(path.join(__dirname, 'frontend')));

const dinhviProxy = createProxyMiddleware({ target: 'http://127.0.0.1:5000', changeOrigin: true });
const crawlerProxy = createProxyMiddleware({ target: 'http://127.0.0.1:8000', changeOrigin: true });

app.use('/api/vnpost', dinhviProxy);
app.use('/api/export', dinhviProxy);
app.use('/api/export-batch', dinhviProxy);
app.use('/api/merge-and-save', dinhviProxy);
app.use('/api/history', dinhviProxy);
app.use('/api', crawlerProxy);

app.listen(9999, () => {
    console.log('----------------------------------------------------');
    console.log('Frontend and proxy running on http://localhost:9999');
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

echo "All services started! Press Ctrl+C to stop."

trap "echo 'Stopping services...'; kill $CRAWLER_PID $DINHVI_PID $PROXY_PID 2>/dev/null; exit" INT TERM EXIT

wait
