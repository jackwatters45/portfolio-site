export interface Restaurant {
  name: string;
  suburb: string;
  address?: string;
  mapsUrl?: string;
  coordinates?: [number, number];
  visited?: string;
  dishes: string[];
  scores?: { meg: number | null; jack: number | null };
}

// Page exports supply only the index/map metadata. Review HTML stays in each page.
const pages = import.meta.glob<{ restaurant: Restaurant }>(
  '@site/src/pages/restaurants/*.astro',
  { eager: true },
);

export function getRestaurants() {
  return Object.entries(pages)
    .map(([path, { restaurant }]) => ({
      id: path.slice(path.lastIndexOf('/') + 1, -'.astro'.length),
      data: restaurant,
    }))
    .sort(
      (a, b) =>
        (b.data.visited ?? '').localeCompare(a.data.visited ?? '') ||
        a.data.name.localeCompare(b.data.name, 'en-AU'),
    );
}
