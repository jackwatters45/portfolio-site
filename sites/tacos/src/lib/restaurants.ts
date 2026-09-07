import { getCollection } from 'astro:content';

export async function getRestaurants() {
  const restaurants = await getCollection(
    'restaurants',
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  return restaurants.sort(
    (a, b) =>
      (b.data.ratings.meg.score ?? -10) +
        (b.data.ratings.jack.score ?? -10) -
        ((a.data.ratings.meg.score ?? -10) +
          (a.data.ratings.jack.score ?? -10)) ||
      a.data.name.localeCompare(b.data.name, 'en-AU'),
  );
}
