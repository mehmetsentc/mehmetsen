import type { NextConfig } from 'next'
import { NEWS_IMAGE_REMOTE_PATTERNS } from './src/constants/imageHosts'

const nextConfig: NextConfig = {
  compress: true,
  images: {
    // Cache optimized images for 7 days (default is 60s — too aggressive for news images)
    minimumCacheTTL: 60 * 60 * 24 * 7,
    // Serve modern formats
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile photos
      },
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
  // Reduce JS bundle size on mobile by splitting large packages
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@firebase/firestore',
    ],
  },
}

export default nextConfig
