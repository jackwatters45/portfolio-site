import type { ReviewSite } from '@personal-sites/reviews/site';

export default {
  name: 'tacos of melbourne',
  description: 'Melbourne taco reviews by Meg and Jack.',
  mapTitle: 'Melbourne taco map',
  mapDescription: 'Find our reviewed taco restaurants on a map of Melbourne.',
  markerIcon:
    '<svg width="30" height="26" viewBox="0 0 32 28" fill="none"><path d="M4 19C1 12 6 4 13 5c3-5 9-2 10 1 6-1 9 5 6 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 22a13 13 0 0 1 26 0Z" fill="currentColor"/><path d="m9 18 2-2m5 3 1-3m5 3 1 1" stroke="var(--paper)" stroke-width="2" stroke-linecap="round"/></svg>',
  prints: [
    'lime',
    'paloma',
    'chilli',
    'chips',
    'avocado',
    'margarita',
    'guacamole',
  ],
} satisfies ReviewSite;
