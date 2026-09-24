// NZD estimates from the itinerary and docs/research, dated 22–23 September 2026.
// Keep these amounts in sync with the itinerary when its prices change.
// Amounts are integer cents. No live quotes or currency conversion.
export interface ActivityOption {
  readonly id: string;
  readonly label: string;
  readonly cents: number;
  readonly basis: 'adult' | 'seven-person-group';
  readonly from?: boolean;
}

interface Activity {
  readonly id: string;
  readonly name: string;
  readonly itinerary: string;
  readonly note?: string;
  readonly options: readonly [ActivityOption, ...ActivityOption[]];
}

export const activities: readonly Activity[] = [
  {
    id: 'skyline-luge',
    name: 'Skyline Gondola & Luge',
    itinerary: '#adventures',
    note: 'Includes gondola. Unlimited rides are unavailable during peak holidays; confirm October prices and availability. Selecting Ziptrek as well counts a gondola ticket in each package.',
    options: [
      { id: 'three-rides', label: '3 luge rides', cents: 9900, basis: 'adult' },
      { id: 'five-rides', label: '5 luge rides', cents: 10400, basis: 'adult' },
      { id: 'six-rides', label: '6 luge rides', cents: 10600, basis: 'adult' },
      {
        id: 'unlimited',
        label: 'Unlimited rides',
        cents: 14000,
        basis: 'adult',
      },
    ],
  },
  {
    id: 'shotover',
    name: 'Shotover Jet',
    itinerary: '#adventures',
    options: [
      { id: 'ride', label: 'Canyon ride', cents: 19900, basis: 'adult' },
    ],
  },
  {
    id: 'ziptrek',
    name: 'Ziptrek',
    itinerary: '#adventures',
    note: 'Includes the $69 gondola ticket.',
    options: [
      { id: 'moa', label: 'Moa · 4 lines', cents: 23800, basis: 'adult' },
      { id: 'kea', label: 'Kea · 6 lines', cents: 28800, basis: 'adult' },
    ],
  },
  {
    id: 'kawarau',
    name: 'Kawarau Bridge Bungy',
    itinerary: '#adventures',
    options: [
      {
        id: 'jump',
        label: '43 m jump',
        cents: 32000,
        basis: 'adult',
        from: true,
      },
    ],
  },
  {
    id: 'nevis',
    name: 'Nevis Bungy',
    itinerary: '#adventures',
    options: [
      {
        id: 'jump',
        label: '134 m jump',
        cents: 39500,
        basis: 'adult',
        from: true,
      },
    ],
  },
  {
    id: 'skydive',
    name: 'NZONE Skydive',
    itinerary: '#adventures',
    note: 'Optional photos and video are not included.',
    options: [
      {
        id: '9000',
        label: '9,000 ft',
        cents: 37900,
        basis: 'adult',
        from: true,
      },
      {
        id: '12000',
        label: '12,000 ft',
        cents: 46900,
        basis: 'adult',
        from: true,
      },
      {
        id: '15000',
        label: '15,000 ft',
        cents: 57500,
        basis: 'adult',
        from: true,
      },
    ],
  },
  {
    id: 'onsen',
    name: 'Original Onsen',
    itinerary: '#onsen',
    note: 'Two pools for seven people, split 4 + 3.',
    options: [
      {
        id: 'two-pools',
        label: '60-minute soak',
        cents: 48500,
        basis: 'seven-person-group',
      },
    ],
  },
  {
    id: 'glenorchy',
    name: 'Glenorchy road trip',
    itinerary: '#glenorchy',
    note: 'One-day rental for 17 October only. Fuel is not included.',
    options: [
      {
        id: 'basic',
        label: 'Basic cover',
        cents: 30200,
        basis: 'seven-person-group',
      },
      {
        id: 'peace-of-mind',
        label: 'Peace of Mind cover',
        cents: 36900,
        basis: 'seven-person-group',
      },
    ],
  },
  {
    id: 'wine',
    name: 'Wine half-day',
    itinerary: '#wine',
    note: 'Choose bike or bus, not both. Each estimate includes Gibbston and Kinross tastings ($30 each). Bike uses the advertised package starting rate ($105); the e-bike upgrade is unpriced and excluded. No lunch or bottles. Confirm October prices and availability.',
    options: [
      {
        id: 'bike-and-tastings',
        label: 'Bike + two tastings',
        cents: 10500 + 3000 + 3000,
        basis: 'adult',
        from: true,
      },
      {
        id: 'bus-and-tastings',
        label: 'Bus + two tastings',
        cents: 9950 + 3000 + 3000,
        basis: 'adult',
        from: true,
      },
    ],
  },
];

// Round each shared line to cents, so the displayed lines add up to the total.
export const perPersonCents = (option: ActivityOption): number =>
  option.basis === 'adult' ? option.cents : Math.round(option.cents / 7);

const dollars = new Intl.NumberFormat('en-NZ', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatNZD = (cents: number): string =>
  `$${dollars.format(cents / 100)}`;
