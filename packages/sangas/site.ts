import type { ReviewSite } from '@personal-sites/reviews/site';

export default {
  name: 'sangas of melbourne',
  otherSite: {
    name: 'Tacos',
    href: 'https://tacos.jackwatters.dev',
    devHref: 'http://localhost:4322',
  },
  description: 'Melbourne sandwich reviews by Meg and Jack.',
  mapTitle: 'Melbourne sanga map',
  mapDescription: 'Find our reviewed sandwich spots on a map of Melbourne.',
  markerIcon:
    '<svg width="30" height="26" viewBox="0 0 32 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14 16 4l13 10H3Z"/><path d="m3 18 5 2 5-2 5 2 5-2 6 2M3 24h26"/></svg>',
  prints: [
    'pickle',
    'sandwich',
    'sourdough',
    'tomato',
    'sub-roll',
    'toastie',
    'swiss-cheese',
    'espresso',
  ],
} satisfies ReviewSite;
