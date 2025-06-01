const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/renderer/js/app.js',
  target: 'electron-renderer',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'src/renderer/dist')
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
      // Removed babel-loader rule since we're using ES6 modules directly
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  devtool: 'source-map'
};