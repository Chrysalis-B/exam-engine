import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import path from 'path'
import webpack from 'webpack'
import { merge } from 'webpack-merge'

export function getWebpackConfig(configuration: webpack.Configuration) {
  return merge(
    {
      output: {
        publicPath: '',
        filename: 'main-bundle.js',
      },
      resolve: {
        fallback: { path: false },
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      },
      plugins: [
        new MiniCssExtractPlugin({
          filename: '[name].css',
        }),
      ],
      module: {
        rules: [
          {
            test: /\.(less|css)$/,
            use: [
              MiniCssExtractPlugin.loader,
              { loader: require.resolve('css-loader'), options: { importLoaders: 2, sourceMap: true } },
              { loader: require.resolve('postcss-loader'), options: { postcssOptions: { config: __dirname } } },
              {
                loader: require.resolve('less-loader'),
                options: {
                  sourceMap: true,
                  lessOptions: {
                    paths: [path.resolve(__dirname, 'src')],
                  },
                },
              },
            ],
          },
          {
            test: /\.xml$/,
            use: [
              {
                loader: path.resolve(__dirname, 'exam-loader.js'),
              },
            ],
          },
          {
            test: /\.(woff|woff2|otf|ttf|eot|svg|png|gif|jpg)$/,
            loader: require.resolve('file-loader'),
            options: {
              name: 'assets/[name].[ext]',
            },
          },
        ],
      },
      performance: {
        hints: false,
      },
    },
    configuration
  )
}
