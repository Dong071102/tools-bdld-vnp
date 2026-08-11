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
