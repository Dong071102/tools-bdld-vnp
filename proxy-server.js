const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/static', express.static(path.join(__dirname, 'frontend')));

// Proxies with full path preservation
app.use(createProxyMiddleware({
    target: 'http://127.0.0.1:5000',
    changeOrigin: true,
    pathFilter: [
        '/api/vnpost/**',
        '/api/export/**',
        '/api/export-batch/**',
        '/api/merge-and-save/**',
        '/api/history/**'
    ]
}));

app.use(createProxyMiddleware({
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    pathFilter: '/api/locton/**'
}));

app.use(createProxyMiddleware({
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    pathFilter: '/api/**'
}));

const PORT = process.env.PORT || process.env.FRONTEND_PORT || 8080;
app.listen(PORT, () => {
    console.log('----------------------------------------------------');
    console.log(`Frontend and proxy running on http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
});
