const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './src/renderer/js/app.js',
  target: 'electron-renderer',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'src/renderer/dist'),
    clean: true,
    globalObject: 'window'
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.mjs'],
    fallback: {
      "util": false,
      "crypto": false,
      "stream": false,
      "buffer": require.resolve('buffer/'),
      "process": require.resolve('process/browser'),
      "path": false,
      "fs": false,
      "os": false,
      "http": false,
      "https": false,
      "url": false,
      "querystring": false,
      "zlib": false,
      "net": false,
      "tls": false,
      "child_process": false
    }
  },
  externals: {
    'electron': 'commonjs electron'
  },
  devtool: process.env.NODE_ENV === 'production' ? false : 'source-map',
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};