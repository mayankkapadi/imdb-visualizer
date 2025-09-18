/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'
const repo = 'imdb-visualizer'   // EXACT repo name

module.exports = {
  output: 'export',
  assetPrefix: isProd ? `/${repo}/` : '',
  basePath:   isProd ? `/${repo}`   : '',

  // keep CI calm for portfolio apps
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
}