/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'
const repo = 'imdb-visualizer' // <-- keep this repo name

const nextConfig = {
  output: 'export',
  assetPrefix: isProd ? `/${repo}/` : '',
  basePath:   isProd ? `/${repo}`   : '',
}
module.exports = nextConfig