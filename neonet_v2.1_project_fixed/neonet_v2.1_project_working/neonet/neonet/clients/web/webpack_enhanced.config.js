// neonet/clients/web/webpack_enhanced.config.js
// Configuração Aprimorada do Webpack para NeoNet Enhanced

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

module.exports = {
  mode: isProduction ? 'production' : 'development',
  
  entry: {
    main: './src/main_enhanced.js',
    app: './src/app_enhanced.js',
    sw: './src/sw_enhanced.js'
  },
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: isProduction ? '[name].[contenthash].js' : '[name].js',
    chunkFilename: isProduction ? '[name].[contenthash].chunk.js' : '[name].chunk.js',
    publicPath: '/',
    clean: true,
    assetModuleFilename: 'assets/[name].[contenthash][ext]'
  },
  
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@p2p': path.resolve(__dirname, 'src/p2p'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@platform': path.resolve(__dirname, 'src/platform'),
      '@blockchain': path.resolve(__dirname, 'src/blockchain'),
      '@dapps': path.resolve(__dirname, 'mock-dapps')
    }
  },
  
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['> 1%', 'last 2 versions', 'not ie <= 11']
                },
                useBuiltIns: 'usage',
                corejs: 3
              }]
            ],
            plugins: [
              '@babel/plugin-proposal-class-properties',
              '@babel/plugin-proposal-optional-chaining',
              '@babel/plugin-proposal-nullish-coalescing-operator'
            ]
          }
        }
      },
      {
        test: /\.css$/i,
        use: [
          isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              sourceMap: isDevelopment
            }
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  ['autoprefixer'],
                  ...(isProduction ? [['cssnano']] : [])
                ]
              }
            }
          }
        ]
      },
      {
        test: /\.(png|jpe?g|gif|svg|ico)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name].[contenthash][ext]'
        }
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name].[contenthash][ext]'
        }
      },
      {
        test: /\.(mp3|wav|ogg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'audio/[name].[contenthash][ext]'
        }
      },
      {
        test: /\.json$/i,
        type: 'asset/resource',
        generator: {
          filename: 'data/[name].[contenthash][ext]'
        }
      }
    ]
  },
  
  plugins: [
    // Limpeza do diretório de build
    new CleanWebpackPlugin(),
    
    // Geração do HTML principal
    new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html',
      chunks: ['main', 'app'],
      inject: 'body',
      minify: isProduction ? {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeStyleLinkTypeAttributes: true,
        keepClosingSlash: true,
        minifyJS: true,
        minifyCSS: true,
        minifyURLs: true
      } : false,
      templateParameters: {
        isProduction,
        version: process.env.npm_package_version || '2.0.0'
      }
    }),
    
    // Extração de CSS em produção
    ...(isProduction ? [
      new MiniCssExtractPlugin({
        filename: 'css/[name].[contenthash].css',
        chunkFilename: 'css/[name].[contenthash].chunk.css'
      })
    ] : []),
    
    // Cópia de arquivos estáticos
    new CopyWebpackPlugin({
      patterns: [
        {
          from: '404.html',
          to: '404.html'
        },
        {
          from: 'mock-dapps',
          to: 'mock-dapps',
          globOptions: {
            ignore: ['**/*.js'] // JS files são processados pelo webpack
          }
        },
        {
          from: 'src/sw_enhanced.js',
          to: 'sw_enhanced.js'
        },
        {
          from: 'src/sw.js',
          to: 'sw.js'
        }
      ]
    }),
    
    // Service Worker com Workbox (apenas em produção)
    ...(isProduction ? [
      new WorkboxPlugin.GenerateSW({
        clientsClaim: true,
        skipWaiting: true,
        swDest: 'sw-workbox.js',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          },
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-resources'
            }
          }
        ]
      })
    ] : []),
    
    // Análise de bundle (apenas quando solicitado)
    ...(process.env.ANALYZE ? [
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        reportFilename: 'bundle-report.html'
      })
    ] : [])
  ],
  
  optimization: {
    minimize: isProduction,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: isProduction,
            drop_debugger: isProduction
          },
          format: {
            comments: false
          }
        },
        extractComments: false
      }),
      new CssMinimizerPlugin()
    ],
    
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10
        },
        utils: {
          test: /[\\/]src[\\/]utils[\\/]/,
          name: 'utils',
          chunks: 'all',
          priority: 5
        },
        p2p: {
          test: /[\\/]src[\\/]p2p[\\/]/,
          name: 'p2p',
          chunks: 'all',
          priority: 5
        },
        dapps: {
          test: /[\\/]mock-dapps[\\/]/,
          name: 'dapps',
          chunks: 'all',
          priority: 3
        }
      }
    },
    
    runtimeChunk: {
      name: 'runtime'
    }
  },
  
  devtool: isDevelopment ? 'eval-source-map' : 'source-map',
  
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
      publicPath: '/'
    },
    compress: true,
    port: 3000,
    hot: true,
    open: true,
    historyApiFallback: true,
    client: {
      overlay: {
        errors: true,
        warnings: false
      }
    },
    headers: {
      'Service-Worker-Allowed': '/'
    },
    setupMiddlewares: (middlewares, devServer) => {
      // Middleware personalizado para desenvolvimento
      devServer.app.get('/api/*', (req, res) => {
        res.json({ 
          message: 'API mock response',
          path: req.path,
          timestamp: Date.now()
        });
      });
      
      return middlewares;
    }
  },
  
  performance: {
    hints: isProduction ? 'warning' : false,
    maxEntrypointSize: 512000, // 500kb
    maxAssetSize: 512000
  },
  
  stats: {
    colors: true,
    modules: false,
    children: false,
    chunks: false,
    chunkModules: false
  }
};

// Configurações específicas para diferentes ambientes
if (process.env.NODE_ENV === 'development') {
  module.exports.plugins.push(
    new HtmlWebpackPlugin({
      template: './mock-dapps/neonet-chat/index.html',
      filename: 'mock-dapps/neonet-chat/index.html',
      chunks: [],
      inject: false
    }),
    new HtmlWebpackPlugin({
      template: './mock-dapps/neonet-notes/index.html',
      filename: 'mock-dapps/neonet-notes/index.html',
      chunks: [],
      inject: false
    })
  );
}

// Configurações para PWA
if (isProduction) {
  module.exports.plugins.push(
    new HtmlWebpackPlugin({
      template: './manifest.json',
      filename: 'manifest.json',
      inject: false
    })
  );
}

