import type { NextConfig } from 'next'
import { NEWS_IMAGE_REMOTE_PATTERNS } from './src/constants/imageHosts'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile photos
      },
      // External ticket-platform event cover images. The Events UI serves these
      // through the same-origin /api/events/image proxy, but allow the hosts
      // directly too in case next/image is used for them anywhere.
      {
        protocol: 'https',
        hostname: 'www.biletix.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.bubilet.com.tr',
      },
      // RSS / news thumbnail hosts (ingested articles)
      ...NEWS_IMAGE_REMOTE_PATTERNS,
    ],
  },
}

export default nextConfig
