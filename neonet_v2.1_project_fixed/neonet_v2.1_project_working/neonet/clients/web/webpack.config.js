const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/main.js", // Entry point for your main application logic
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true, // Clean the output directory before building
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./index_scalable.html", // Use your new main HTML file as a template
      filename: "index_scalable.html", // Output file name in dist
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: "mock-dapps/neonet-chat",
          to: "mock-dapps/neonet-chat",
        },
        {
          from: "mock-dapps/neonet-videos",
          to: "mock-dapps/neonet-videos",
        },

      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/, // Ensure both .js and .jsx files are processed by Babel
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"]
          }
        }
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx"],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 3000,
  },
};


