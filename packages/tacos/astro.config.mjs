import { reviewSite } from '@personal-sites/reviews/config';

export default reviewSite({
  url: 'https://tacos.jackwatters.dev',
  port: 4322,
  configUrl: import.meta.url,
});
