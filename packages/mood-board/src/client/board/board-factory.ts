import {
  BoardTimestampSchema,
  ItemIdSchema,
  type ItemId,
} from '../../lib/board-rpc';
import type { Board, BoardItem } from './types';

const itemId = (value: string): ItemId => ItemIdSchema.make(value);

const demoItems: BoardItem[] = [
  {
    id: itemId('sample-alpine'),
    kind: 'image',
    src: 'https://picsum.photos/seed/alpine-form/1600/1050',
    x: -1140,
    y: -610,
    width: 760,
    height: 499,
    rotation: 0,
    order: 1,
  },
  {
    id: itemId('sample-figure'),
    kind: 'image',
    src: 'https://picsum.photos/seed/quiet-figure/900/1250',
    x: -310,
    y: -690,
    width: 440,
    height: 611,
    rotation: 0,
    order: 2,
  },
  {
    id: itemId('sample-architecture'),
    kind: 'image',
    src: 'https://picsum.photos/seed/soft-architecture/1500/980',
    x: 220,
    y: -560,
    width: 720,
    height: 470,
    rotation: 0,
    order: 3,
  },
  {
    id: itemId('sample-still-life'),
    kind: 'image',
    src: 'https://picsum.photos/seed/amber-still-life/1000/1350',
    x: -1240,
    y: 0,
    width: 510,
    height: 689,
    rotation: 0,
    order: 4,
  },
  {
    id: itemId('sample-swatch'),
    kind: 'swatch',
    color: '#8c3335',
    label: 'Oxblood / evening',
    x: -650,
    y: -15,
    width: 350,
    height: 450,
    rotation: 0,
    order: 5,
  },
  {
    id: itemId('sample-note'),
    kind: 'note',
    text: 'A room that feels collected, not decorated.',
    x: -195,
    y: 25,
    width: 520,
    height: 330,
    rotation: 0,
    order: 6,
  },
  {
    id: itemId('sample-water'),
    kind: 'image',
    src: 'https://picsum.photos/seed/water-memory/960/1280',
    x: 410,
    y: 20,
    width: 450,
    height: 600,
    rotation: 0,
    order: 7,
  },
  {
    id: itemId('sample-object'),
    kind: 'image',
    src: 'https://picsum.photos/seed/strange-object/1450/920',
    x: -890,
    y: 760,
    width: 700,
    height: 444,
    rotation: 0,
    order: 8,
  },
  {
    id: itemId('sample-paper'),
    kind: 'image',
    src: 'https://picsum.photos/seed/paper-study/1200/900',
    x: -80,
    y: 690,
    width: 620,
    height: 465,
    rotation: 0,
    order: 9,
  },
  {
    id: itemId('sample-blue'),
    kind: 'swatch',
    color: '#253553',
    label: 'Ink / after midnight',
    x: 650,
    y: 710,
    width: 360,
    height: 430,
    rotation: 0,
    order: 10,
  },
];

export function createDemoBoard(): Board {
  return {
    version: 1,
    title: 'For the way a place can feel',
    items: demoItems.map((item) => ({ ...item })),
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };
}

export function createEmptyBoard(): Board {
  return {
    version: 1,
    title: 'Untitled mood',
    items: [],
    updatedAt: BoardTimestampSchema.make(Date.now()),
  };
}

export function createId(): ItemId {
  return ItemIdSchema.make(
    `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
  );
}
