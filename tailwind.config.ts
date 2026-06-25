import type { Config } from 'tailwindcss'

/**
 * Tailwind v3 — NaHaber 2026 Token Bridge
 *
 * Tüm renkler `rgb(var(--token) / <alpha>)` formatında token'lara köprülenir.
 * Bu sayede tailwind class'larından (`bg-brand-500`, `text-cat-spor`,
 * `border-border-default`) doğrudan token sistemini kullanabilirsin ve light/
 * dark/OLED arası geçişler otomatik olur.
 */
const rgbVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── Brand ─────────────────────────────────────────────────── */
        brand: {
          50:  rgbVar('--brand-50'),
          100: rgbVar('--brand-100'),
          200: rgbVar('--brand-200'),
          300: rgbVar('--brand-300'),
          400: rgbVar('--brand-400'),
          500: rgbVar('--brand-500'),
          600: rgbVar('--brand-600'),
          700: rgbVar('--brand-700'),
          800: rgbVar('--brand-800'),
          900: rgbVar('--brand-900'),
          DEFAULT: rgbVar('--brand-500'),
        },
        support: {
          DEFAULT: rgbVar('--support-500'),
        },
        /* ── Surfaces ──────────────────────────────────────────────── */
        bg: {
          base:     rgbVar('--bg-base'),
          subtle:   rgbVar('--bg-subtle'),
          muted:    rgbVar('--bg-muted'),
          card:     rgbVar('--bg-card'),
          elevated: rgbVar('--bg-elevated'),
          inverse:  rgbVar('--bg-inverse'),
        },
        border: {
          subtle:  rgbVar('--border-subtle'),
          DEFAULT: rgbVar('--border-default'),
          strong:  rgbVar('--border-strong'),
          focus:   rgbVar('--border-focus'),
        },
        text: {
          primary:   rgbVar('--text-primary'),
          secondary: rgbVar('--text-secondary'),
          tertiary:  rgbVar('--text-tertiary'),
          muted:     rgbVar('--text-muted'),
          inverse:   rgbVar('--text-inverse'),
          onbrand:   rgbVar('--text-onbrand'),
          link:      rgbVar('--text-link'),
        },
        /* ── Semantic ──────────────────────────────────────────────── */
        success: { DEFAULT: rgbVar('--success-500'), fg: rgbVar('--success-fg') },
        warning: { DEFAULT: rgbVar('--warning-500'), fg: rgbVar('--warning-fg') },
        danger:  { DEFAULT: rgbVar('--danger-500'),  fg: rgbVar('--danger-fg') },
        info:    { DEFAULT: rgbVar('--info-500'),    fg: rgbVar('--info-fg') },
        /* ── Category accents ──────────────────────────────────────── */
        cat: {
          gundem:     rgbVar('--cat-gundem'),
          sondakika:  rgbVar('--cat-sondakika'),
          siyaset:    rgbVar('--cat-siyaset'),
          ekonomi:    rgbVar('--cat-ekonomi'),
          spor:       rgbVar('--cat-spor'),
          dunya:      rgbVar('--cat-dunya'),
          teknoloji:  rgbVar('--cat-teknoloji'),
          saglik:     rgbVar('--cat-saglik'),
          kultur:     rgbVar('--cat-kultur'),
          yerel:      rgbVar('--cat-yerel'),
          yasam:      rgbVar('--cat-yasam'),
          video:      rgbVar('--cat-video'),
          egitim:     rgbVar('--cat-egitim'),
          magazin:    rgbVar('--cat-magazin'),
          hava:       rgbVar('--cat-hava'),
        },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs':  ['var(--fs-2xs)',  { lineHeight: 'var(--lh-normal)' }],
        xs:     ['var(--fs-xs)',   { lineHeight: 'var(--lh-normal)' }],
        sm:     ['var(--fs-sm)',   { lineHeight: 'var(--lh-relaxed)' }],
        base:   ['var(--fs-md)',   { lineHeight: 'var(--lh-relaxed)' }],
        lg:     ['var(--fs-lg)',   { lineHeight: 'var(--lh-relaxed)' }],
        xl:     ['var(--fs-xl)',   { lineHeight: 'var(--lh-snug)' }],
        '2xl':  ['var(--fs-2xl)',  { lineHeight: 'var(--lh-snug)' }],
        '3xl':  ['var(--fs-3xl)',  { lineHeight: 'var(--lh-snug)' }],
        '4xl':  ['var(--fs-4xl)',  { lineHeight: 'var(--lh-tight)' }],
        '5xl':  ['var(--fs-5xl)',  { lineHeight: 'var(--lh-tight)' }],
        '6xl':  ['var(--fs-6xl)',  { lineHeight: 'var(--lh-tight)' }],
      },
      letterSpacing: {
        tightest: 'var(--tracking-tightest)',
        tighter:  'var(--tracking-tighter)',
        tight:    'var(--tracking-tight)',
        normal:   'var(--tracking-normal)',
        wide:     'var(--tracking-wide)',
        wider:    'var(--tracking-wider)',
        widest:   'var(--tracking-widest)',
      },
      borderRadius: {
        none:  'var(--radius-none)',
        xs:    'var(--radius-xs)',
        sm:    'var(--radius-sm)',
        md:    'var(--radius-md)',
        lg:    'var(--radius-lg)',
        xl:    'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        '4xl': 'var(--radius-4xl)',
        full:  'var(--radius-full)',
      },
      boxShadow: {
        xs:     'var(--shadow-xs)',
        sm:     'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md:     'var(--shadow-md)',
        lg:     'var(--shadow-lg)',
        xl:     'var(--shadow-xl)',
        '2xl':  'var(--shadow-2xl)',
        brand:  'var(--shadow-brand)',
        glow:   'var(--shadow-glow)',
      },
      transitionDuration: {
        instant:  '0ms',
        fast:     '120ms',
        quick:    '180ms',
        DEFAULT:  '240ms',
        relaxed:  '320ms',
        slow:     '420ms',
        slower:   '560ms',
        slowest:  '720ms',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.16, 1, 0.3, 1)',
        bounce:     'cubic-bezier(0.34, 1.56, 0.64, 1)',
        spring:     'cubic-bezier(0.5, 0, 0.1, 1)',
      },
      animation: {
        'fade-in':    'na-fade-in var(--motion-base) var(--ease-out-soft) both',
        'fade-out':   'na-fade-out var(--motion-base) var(--ease-out-soft) both',
        'slide-up':   'na-slide-up var(--motion-base) var(--ease-out-soft) both',
        'slide-down': 'na-slide-down var(--motion-base) var(--ease-out-soft) both',
        'scale-in':   'na-scale-in var(--motion-quick) var(--ease-bounce) both',
        'sheet-up':   'na-sheet-up var(--motion-relaxed) var(--ease-out-soft) both',
        'pulse-brand': 'na-pulse-brand 1.6s ease-in-out infinite',
        shimmer:       'na-shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

export default config
