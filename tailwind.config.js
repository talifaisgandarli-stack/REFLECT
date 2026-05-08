/**
 * Tokens map directly to designstyle4 §2 / Appendix A.
 * Source of truth: docs/designstyle4.md. Do not add ad-hoc colors.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          action: '#ADFB49',
          'action-hover': '#9BE83E',
          'action-soft': '#ECFFB6',
          text: '#1A5140',
          deep: '#0E3838',
          mid: '#5CA87C',
          soft: '#B7E5BA',
          mist: '#DCFCE7',
        },
        canvas: {
          DEFAULT: '#FAFAF7',
          dots: '#D8D6CD',
          warm: '#F4F2EC',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          mist: '#F0EFE9',
        },
        line: {
          DEFAULT: '#E8E6DD',
          soft: '#EFEEE8',
        },
        ink: '#0E1611',
        text: {
          DEFAULT: '#1F2925',
          soft: '#4F5A55',
          muted: '#7A857F',
          faint: '#A8B0AB',
        },
        status: {
          'idea-dot': '#A78BFA',
          'idea-bg': '#F4F0FE',
          'idea-text': '#7C3AED',
          'queued-dot': '#94A3B8',
          'queued-bg': '#F1F5F2',
          'queued-text': '#475569',
          'active-dot': '#3B82F6',
          'active-bg': '#EAF2FF',
          'active-text': '#1D4ED8',
          'review-dot': '#D97706',
          'review-bg': '#FFF6E5',
          'review-text': '#92400E',
          'expert-dot': '#7C5CD9',
          'expert-bg': '#F0EBFB',
          'expert-text': '#5B3FB8',
          'done-dot': '#22C55E',
          'done-bg': '#ECF9EF',
          'done-text': '#15803D',
          'cancel-dot': '#EF4444',
          'cancel-bg': '#FEEEED',
          'cancel-text': '#B91C1C',
        },
        presence: {
          online: '#22C55E',
          away: '#F59E0B',
          offline: '#A8B0AB',
        },
        mirai: {
          surface: '#0E1611',
          particle: '#FAFAF7',
        },
      },
      fontFamily: {
        sans: [
          'Satoshi',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
      },
      fontSize: {
        hero: ['56px', { lineHeight: '60px', fontWeight: '900', letterSpacing: '-0.02em' }],
        h1: ['32px', { lineHeight: '38px', fontWeight: '700', letterSpacing: '-0.02em' }],
        h2: ['24px', { lineHeight: '30px', fontWeight: '700', letterSpacing: '-0.01em' }],
        h3: ['18px', { lineHeight: '24px', fontWeight: '600', letterSpacing: '-0.01em' }],
        h4: ['16px', { lineHeight: '22px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        ui: ['13px', { lineHeight: '18px', fontWeight: '500' }],
        meta: ['12px', { lineHeight: '16px', fontWeight: '400' }],
        tiny: ['11px', { lineHeight: '14px', fontWeight: '500' }],
      },
      borderRadius: {
        capsule: '24px',
        card: '14px',
        btn: '10px',
        chip: '6px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,22,17,0.04)',
        'card-hover': '0 4px 16px rgba(14,22,17,0.06)',
        'btn-action': '0 4px 12px rgba(173,251,73,0.25)',
        toast: '0 8px 24px rgba(14,22,17,0.16)',
        focus: '0 0 0 3px rgba(173, 251, 73, 0.33)',
      },
      backgroundImage: {
        'grad-feature':
          'radial-gradient(70% 30% at 30% 30%, #ADFB49 0%, #B7E5BA 60%, #5CA87C 100%)',
        'grad-folder-sage': 'linear-gradient(135deg, #B7E5BA 0%, #5CA87C 100%)',
        'grad-folder-lime': 'linear-gradient(135deg, #DCFCE7 0%, #ADFB49 100%)',
        'grad-folder-forest': 'linear-gradient(135deg, #1A5140 0%, #5CA87C 100%)',
        'grad-folder-peach': 'linear-gradient(135deg, #FED7AA 0%, #FFB347 100%)',
        'grad-folder-lavender': 'radial-gradient(circle, #84A6FF 0%, #C8B4F0 100%)',
      },
      transitionTimingFunction: {
        out4: 'cubic-bezier(0.22, 1, 0.36, 1)',
        in4: 'cubic-bezier(0.55, 0, 1, 0.45)',
        spring: 'cubic-bezier(0.5, 1.5, 0.5, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '220ms',
        slow: '420ms',
      },
    },
  },
  plugins: [],
};
