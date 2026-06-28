const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/hub',
    createProxyMiddleware(['!/sockjs-node'], {
      target: 'http://localhost:51429/',
      changeOrigin: true,
      ws: true,
    })
  );
};