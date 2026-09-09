import { reviewSite } from '@personal-sites/reviews/config';

export default reviewSite({
  url: 'https://sangas.jackwatters.dev',
  port: 4324,
  configUrl: import.meta.url,
});
