import { getCollection } from 'astro:content';

export async function getRestaurants() {
  const restaurants = await getCollection(
    'restaurants',
    ({ data }) => import.meta.env.DEV || !data.draft,
  );
  return restaurants.sort(
    (a, b) =>
      (b.data.visited ?? '').localeCompare(a.data.visited ?? '') ||
      a.data.name.localeCompare(b.data.name, 'en-AU'),
  );
}
