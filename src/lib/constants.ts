interface Book {
  name: string;
  link: string;
  genre: string;
}

interface Reading {
  currently: Array<Book>;
  recommend: Array<Book>;
  next: Array<Book>;
}

export const READING: Reading = {
  currently: [
    {
      name: 'Speaker for the Dead',
      link: 'https://www.goodreads.com/book/show/7967.Speaker_for_the_Dead',
      genre: 'Sci-Fi',
    },
    {
      name: 'The Almanack of Naval Ravikant',
      link: 'https://www.goodreads.com/book/show/54898389-the-almanack-of-naval-ravikant?ref=nav_sb_ss_1_10',
      genre: 'Personal Development',
    },
    {
      name: 'For Whom the Bell Tolls',
      link: 'https://www.goodreads.com/book/show/46170.For_Whom_the_Bell_Tolls?ref=nav_sb_ss_1_14',
      genre: 'Historical Fiction',
    },
  ],
  recommend: [
    {
      name: 'Cien Años de Soledad',
      link: 'https://www.goodreads.com/book/show/370523.Cien_a_os_de_soledad?from_search=true&from_srp=true&qid=9iOtGqU8Td&rank=1',
      genre: 'Magical Realism',
    },
    {
      name: 'The Stranger',
      link: 'https://www.goodreads.com/book/show/49552.The_Stranger',
      genre: 'Philosophical Fiction',
    },
    {
      name: 'Meditations',
      link: 'https://www.goodreads.com/book/show/30659.Meditations',
      genre: 'Philosophy',
    },
    {
      name: 'Harry Potter (Spanish version)',
      link: 'https://www.goodreads.com/book/show/15876.Harry_Potter_y_la_Orden_del_F_nix',
      genre: 'Fiction',
    },
    {
      name: 'El Alquimista',
      link: 'https://www.goodreads.com/book/show/41684130-el-alqumista',
      genre: 'Magical Realism',
    },
    {
      name: 'The Creative Act: Way of Being',
      link: 'https://www.goodreads.com/book/show/60965426-the-creative-act',
      genre: 'Philosophy',
    },
    {
      name: 'Norm Macdonald: Based on a Link True Story',
      link: 'https://www.goodreads.com/book/show/28686959-based-on-a-true-story?from_search=true&from_srp=true&qid=ctedItGJ9l&rank=1',
      genre: 'Memoir',
    },
    {
      name: 'Notes From the Underground, The Double, and Other Stories',
      link: 'https://www.goodreads.com/book/show/49961.Notes_from_Underground_The_Double_and_Other_Stories',
      genre: 'Philosophical Fiction',
    },
  ],
  next: [
    {
      name: 'Ficciones',
      link: 'https://www.goodreads.com/book/show/426504.Ficciones',
      genre: 'Magical realism',
    },

    {
      name: "The Hitchhiker's Guide to the Galaxy",
      link: 'https://www.goodreads.com/book/show/11.The_Hitchhiker_s_Guide_to_the_Galaxy',
      genre: 'Science Fiction',
    },
  ],
} as const;

interface Learning {
  currently: Array<string>;
  next: Array<string>;
}

export const LEARNING: Learning = {
  currently: [
    'History',
    'Spanish',
    'Environmental Tech',
    'Writing',
    'Machine Vision',
  ],
  next: [
    'Photography',
    'Video Editing',
    'Catalan',
    'Cooking',
    'Auto Mechanics',
  ],
} as const;

interface Project {
  name: string;
  description: string;
  year: number;
  link?: string;
}

interface Building {
  currently: Array<Project>;
  past: Array<Project>;
  seeds: Array<Project>;
}

export const BUILDING: Building = {
  currently: [
    {
      name: 'LaxDB',
      description: 'Tooling for managing and analyzing athletic teams',
      year: 2025,
      link: 'https://github.com/jackwatters45/lax-db',
    },
  ],
  past: [],
  seeds: [
    {
      name: 'Marketplace Tracker',
      description: 'Track items accross multiple online marketplaces',
      year: 2024,
    },
    {
      name: 'Used Sports Good Service',
      description: 'Sell or Donate Used Equipment',
      year: 2025,
    },
    {
      name: 'Scheduling App',
      description: 'Find the best time for an event',
      year: 2025,
    },
  ],
} as const;

interface MusicItem {
  name: string;
  link: string;
  genre: string;
  album?: string;
  albumLink?: string;
}

interface Listening {
  currently: Array<MusicItem>;
  '2024': Array<MusicItem>;
}

export const LISTENING: Listening = {
  currently: [
    {
      name: 'legallyrxx',
      link: 'https://open.spotify.com/artist/4CairTbnNW5l8GxiRIzsZ3?si=DWtkjXl8T96BjuklLf7yhQ',
      genre: 'Reggaeton',
    },
    {
      name: 'Lalo Ebratt',
      link: 'https://open.spotify.com/artist/1GAymyGBvB4gQy5Z5LZ1Wj?si=eFP6hBnTS7WDX5m2JP4iRA',
      genre: 'Reggaeton',
    },
    {
      name: 'Sammy Virji',
      link: 'https://open.spotify.com/artist/1GuqTQbuixFHD6eBkFwVcb?si=LpFXJMCQS1y_0c6pQT8lLg',
      genre: 'House',
    },
    {
      name: 'Los Abuelos De La Nada',
      link: 'https://open.spotify.com/artist/5R3NywPPOyhLfdvutgg0me?si=WwKqKLauQL65tFNJ1f1U5Q',
      genre: 'Rock',
    },
  ],
  '2024': [
    {
      name: 'Deorro',
      link: 'https://open.spotify.com/artist/6VD4UEUPvtsemqD3mmTqCR?si=LTO1Cl-IRgeO39kwazsobg',
      genre: 'House',
    },
    {
      name: 'Eladio Carrion',
      link: 'https://open.spotify.com/artist/5XJDexmWFLWOkjOEjOVX3e',
      genre: 'Reggaeton',
      album: 'Sauce Boyz 2',
      albumLink: 'https://open.spotify.com/album/4JaYe7HIddzNaF3rUgJzHI',
    },
    {
      name: 'El Mató a un Policía Motorizado',
      link: 'https://open.spotify.com/artist/5rLsN2LxYaEPLa1N7I2mPB',
      genre: 'Rock Independiente',
    },
    {
      name: 'Los Bunkers',
      link: 'https://open.spotify.com/artist/3RTAXX6KGdljBsOIupyZgT',
      genre: 'Rock',
    },
    {
      name: 'Bad Bunny',
      link: 'https://open.spotify.com/artist/4q3ewBCX7sLwd24euuV69X',
      genre: 'Reggaeton',
      album: 'Un Verano Sin Ti',
      albumLink: 'https://open.spotify.com/album/3RQQmkQEvNCY4prGKE6oc5',
    },
    {
      name: 'Ovy On The Drums',
      link: 'https://open.spotify.com/artist/3m5qlPf2OkihLz3dRYnkPA',
      genre: 'Reggaeton',
      album: 'CASSETTE 01',
      albumLink: 'https://open.spotify.com/album/0cuBq2nDgGbjalgB4iUc7M',
    },
    {
      name: 'Las Ligas Menores',
      link: 'https://open.spotify.com/artist/3MNvKeLzGSvOPtXJAjCOzf',
      genre: 'Rock Independiente',
    },
    {
      name: 'Young Miko',
      link: 'https://open.spotify.com/artist/3qsKSpcV3ncke3hw52JSMB',
      genre: 'Reggaeton',
    },
    {
      name: 'FloyyMenor',
      link: 'https://open.spotify.com/artist/7CvTknweLr9feJtRGrpDBy',
      genre: 'Reggaeton',
    },
    {
      name: 'Lolo Og',
      link: 'https://open.spotify.com/artist/1HAO6fqdAGX5CiWxBvhiyv',
      genre: 'RKT',
    },
    {
      name: 'Tainy',
      link: 'https://open.spotify.com/artist/0GM7qgcRCORpGnfcN2tCiB',
      genre: 'Reggaeton',
    },
    {
      name: 'Gusty DJ',
      link: 'https://open.spotify.com/artist/5f9pQjPeDbuRF1GowQXo3L',
      genre: 'RKT',
    },
  ],
} as const;

interface WatchItem {
  name: string;
  link: string;
  description?: string;
}

interface Watching {
  currently: Array<WatchItem>;
  podcasts: Array<WatchItem>;
  movies: Array<WatchItem>;
  shows: Array<WatchItem>;
}

export const WATCHING: Watching = {
  currently: [
    {
      name: 'The Penguin',
      link: 'https://play.max.com/show/5756c2bf-36f8-4890-b1f9-ef168f1d8e9c',
    },
    {
      name: 'Ministerio del Tiempo',
      link: 'https://www.amazon.com/El-ministerio-del-tiempo-Season/dp/B09JV86JF2',
    },
  ],
  podcasts: [
    {
      name: 'Central - Bukele',
      link: 'https://open.spotify.com/show/5rVz6WZuWQKxWalrPaIRxI',
    },
    {
      name: 'Always Sunny Podcast',
      link: 'https://www.youtube.com/@TheAlwaysSunnyPodcast',
    },
    {
      name: 'Radio Ambulante',
      link: 'https://open.spotify.com/show/0J74zdNxUVWHq4gLoq8MqX',
    },
    {
      name: 'Unpacking Latin America',
      link: 'https://open.spotify.com/show/4AWbCJz3e72OaMvuzLHXX4',
    },
  ],
  movies: [
    {
      name: 'Banshees of Inisherin',
      link: 'https://www.imdb.com/title/tt11813216/',
    },
    {
      name: 'Spectre',
      link: 'https://www.imdb.com/title/tt2379713/',
    },
    {
      name: 'Seven Psychopaths',
      link: 'https://www.imdb.com/title/tt1931533/',
    },
    {
      name: 'Source Code',
      link: 'https://www.imdb.com/title/tt0945513/',
    },
    {
      name: 'Crazy, Stupid, Love',
      link: 'https://www.imdb.com/title/tt1570728/',
    },
    {
      name: 'In Bruges',
      link: 'https://www.imdb.com/title/tt0780536/',
    },
    {
      name: 'No Country for Old Men',
      link: 'https://www.imdb.com/title/tt0477348/',
    },
    {
      name: 'Six Shooter',
      link: 'https://www.imdb.com/title/tt0425458/',
    },
    {
      name: 'Batman Returns',
      link: 'https://www.imdb.com/title/tt0103776/',
    },
    {
      name: 'Casablanca',
      link: 'https://www.imdb.com/title/tt0034583/',
    },
  ],
  shows: [
    {
      name: 'Always Sunny in Philadelphia',
      link: 'https://www.imdb.com/title/tt0472954/',
    },
    {
      name: 'La Casa de Papel',
      link: 'https://www.imdb.com/title/tt6468322/',
    },
    {
      name: 'The Blacklist',
      link: 'https://www.imdb.com/title/tt2741602/',
    },
    {
      name: 'The Legend of Korra',
      link: 'https://www.imdb.com/title/tt1695360/',
    },
    {
      name: 'Would I Lie to You?',
      link: 'https://www.imdb.com/title/tt1055238/',
    },
    {
      name: 'Eastbound & Down',
      link: 'https://www.imdb.com/title/tt0866442/',
    },
    {
      name: 'My Name is Earl',
      link: 'https://www.imdb.com/title/tt0460091/',
    },
    {
      name: 'Avatar: The Last Airbender',
      link: 'https://www.imdb.com/title/tt0417299/',
    },
    {
      name: 'Whose Line Is It Anyway?',
      link: 'https://www.imdb.com/title/tt0163507/',
    },
    {
      name: 'Twin Peaks',
      link: 'https://www.imdb.com/title/tt0098936/',
    },
  ],
} as const;
