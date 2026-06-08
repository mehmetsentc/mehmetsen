import { buildFacebookShareUrl } from '@/lib/seo'

export { buildPostShareUrl, buildShareText, isLocalhostOrigin } from '@/lib/seo'

export interface SharePlatform {
  id: string
  label: string
  color: string
  icon:
    | 'whatsapp'
    | 'facebook'
    | 'x'
    | 'telegram'
    | 'linkedin'
    | 'reddit'
    | 'pinterest'
    | 'sms'
    | 'email'
    | 'copy'
    | 'native'
  getAction: (url: string, title: string) => { type: 'link'; href: string } | { type: 'copy' } | { type: 'native' }
}

export const SHARE_PLATFORMS: SharePlatform[] = [
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    color: '#25D366',
    icon: 'whatsapp',
    getAction: (url, title) => ({
      type: 'link',
      href: `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`,
    }),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    color: '#1877F2',
    icon: 'facebook',
    getAction: (url, shareText) => ({
      type: 'link',
      href: buildFacebookShareUrl(url, shareText),
    }),
  },
  {
    id: 'x',
    label: 'X',
    color: '#000000',
    icon: 'x',
    getAction: (url, title) => ({
      type: 'link',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    }),
  },
  {
    id: 'telegram',
    label: 'Telegram',
    color: '#26A5E4',
    icon: 'telegram',
    getAction: (url, title) => ({
      type: 'link',
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    }),
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    color: '#0A66C2',
    icon: 'linkedin',
    getAction: (url) => ({
      type: 'link',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    }),
  },
  {
    id: 'reddit',
    label: 'Reddit',
    color: '#FF4500',
    icon: 'reddit',
    getAction: (url, title) => ({
      type: 'link',
      href: `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    }),
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    color: '#E60023',
    icon: 'pinterest',
    getAction: (url, title) => ({
      type: 'link',
      href: `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(title)}`,
    }),
  },
  {
    id: 'sms',
    label: 'SMS',
    color: '#34C759',
    icon: 'sms',
    getAction: (url, title) => ({
      type: 'link',
      href: `sms:?body=${encodeURIComponent(`${title} ${url}`)}`,
    }),
  },
  {
    id: 'email',
    label: 'E-posta',
    color: '#6B7280',
    icon: 'email',
    getAction: (url, title) => ({
      type: 'link',
      href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n\n${url}`)}`,
    }),
  },
  {
    id: 'copy',
    label: 'Kopyala',
    color: '#6366F1',
    icon: 'copy',
    getAction: () => ({ type: 'copy' }),
  },
  {
    id: 'native',
    label: 'Diğer',
    color: '#374151',
    icon: 'native',
    getAction: () => ({ type: 'native' }),
  },
]
