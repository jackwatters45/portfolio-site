export interface ReviewSite {
  name: string;
  description: string;
  mapTitle: string;
  mapDescription: string;
  markerIcon: string;
  prints: string[];
  otherSite: { name: string; href: string; devHref: string };
}
