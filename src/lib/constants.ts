import type { ListStage } from './types';

interface Book {
  name: string;
  link: string;
  genre: string;
}

type Reading = {
  currently: ListStage<Book>;
  recommend: ListStage<Book>;
  next: ListStage<Book>;
};

export const READING: Reading = {
  currently: {
    index: 0,
    items: [
      {
        name: 'The Savage Detectives',
        link: 'https://www.goodreads.com/book/show/63033.The_Savage_Detectives?from_search=true&from_srp=true&qid=D9qp2j3g5J&rank=1',
        genre: 'Magical Realism',
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
  },
  recommend: {
    index: 1,
    items: [
      {
        name: 'Speaker for the Dead',
        link: 'https://www.goodreads.com/book/show/7967.Speaker_for_the_Dead',
        genre: 'Sci-Fi',
      },
      {
        name: "Ender's Game",
        link: 'https://www.goodreads.com/book/show/375802.Ender_s_Game?from_search=true&from_srp=true&qid=ZaEbuHgFCk&rank=1',
        genre: 'Sci-Fi',
      },
      {
        name: 'Project Hail Mary',
        link: 'https://www.goodreads.com/book/show/54493401-project-hail-mary',
        genre: 'Sci-Fi',
      },
      {
        name: 'The Stranger',
        link: 'https://www.goodreads.com/book/show/49552.The_Stranger',
        genre: 'Philosophical Fiction',
      },
      {
        name: 'Cien Años de Soledad',
        link: 'https://www.goodreads.com/book/show/370523.Cien_a_os_de_soledad?from_search=true&from_srp=true&qid=9iOtGqU8Td&rank=1',
        genre: 'Magical Realism',
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
  },
  next: {
    index: 2,
    items: [
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
  },
} as const;

type Learning = {
  currently: ListStage<string>;
  next: ListStage<string>;
};

export const LEARNING: Learning = {
  currently: {
    index: 0,
    items: [
      'History',
      'Spanish',
      'Environmental Tech',
      'Writing',
      'Machine Vision',
    ],
  },
  next: {
    index: 1,
    items: [
      'Photography',
      'Video Editing',
      'Catalan',
      'Cooking',
      'Auto Mechanics',
    ],
  },
} as const;

interface Project {
  name: string;
  description: string;
  year: number;
  link?: string;
}

type Building = {
  currently: ListStage<Project>;
  past: ListStage<Project>;
  seeds: ListStage<Project>;
};

export const BUILDING: Building = {
  currently: {
    index: 0,
    items: [
      {
        name: 'LaxDB',
        description: 'Tooling for managing and analyzing athletic teams',
        year: 2025,
        link: 'https://github.com/jackwatters45/lax-db',
      },
    ],
  },
  past: {
    index: 1,
    items: [],
  },
  seeds: {
    index: 2,
    items: [
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
  },
} as const;

export type MusicItem = {
  name: string;
  link: string;
  genre: string;
  album?: string;
  albumLink?: string;
};

type Listening = {
  currently: ListStage<MusicItem>;
  '2025': ListStage<MusicItem>;
  '2024': ListStage<MusicItem>;
};

export const LISTENING: Listening = {
  currently: {
    index: 0,
    items: [
      {
        name: 'Demm Deep',
        link: 'https://open.spotify.com/artist/1MzQYOcw4DMB9ISBhZTa7g?si=1XROGwzXQqW0CrU9DtuKXA',
        genre: 'House',
      },
      {
        name: 'Vlads',
        link: 'https://open.spotify.com/artist/25yl7NIlTYP3f3p2R6mG0R?si=nN99W8RRQhCcuQSvIOSKqg',
        genre: 'Indie Rock',
      },
      {
        name: 'Nemzzz',
        link: 'https://open.spotify.com/artist/3DHtfeD4PsmR9YGhCP4VF7?si=0FkU8uuBRDe7rS056Q9_cw',
        genre: 'Rap',
      },
      {
        name: 'Demm Deep',
        link: 'https://open.spotify.com/artist/1MzQYOcw4DMB9ISBhZTa7g?si=1XROGwzXQqW0CrU9DtuKXA',
        genre: 'House',
        album: 'Friday Night',
        albumLink:
          'https://open.spotify.com/album/4YFmoJXlZyuIYvTgjaf6AX?si=7JoPnm-cTmSCnMcfOc7B3Q',
      },
      {
        name: 'KARMA',
        link: 'https://open.spotify.com/artist/2CbSXiRcLCT8xjNeoebez9?si=1T6H-k0IRfuKeupB7wYxog',
        genre: 'House',
        album: 'Sprinter',
        albumLink:
          'https://open.spotify.com/album/1LrwZakIRGBHovLTDBCQSj?si=4NFuUlDZQc2mnfIpab4rLA',
      },
      {
        name: 'Lance Savali',
        link: 'https://open.spotify.com/artist/3BJfXq3PuHFiHrD6PcfpCd?si=AG7WVgxgTbic1RNKx6XYZA',
        genre: 'House',
        album: "TN's",
        albumLink:
          'https://open.spotify.com/album/6re07313Esj1OipNfjjUdh?si=WPA7NVilSmS3t-PQrvDMzw',
      },
      {
        name: '49th & Main',
        link: 'https://open.spotify.com/artist/0nnF48t4C8uqGS5HPnCN3F?si=PWVeQHz2Q5GmSxD-ItcR_A',
        genre: 'House',
      },
      {
        name: 'MOTO BANDIT',
        link: 'https://open.spotify.com/artist/5eMzbeca8z31KcAKRGaGpJ?si=VWb4QPKdR0W6GNqy5H84Fw',
        genre: 'Alternative/Indie',
      },
      {
        name: 'The Bends',
        link: 'https://open.spotify.com/artist/2xBejdNon0VS3Egq8he7sb?si=dWhNPj9nQrmR_eQFt3yjEQ',
        genre: 'Indie Rock',
      },
    ],
  },
  '2025': {
    index: 1,
    items: [
      {
        name: 'Harvey Street',
        link: 'https://open.spotify.com/artist/3uY3EnY1EntZaMeKnIS42A?si=357f8dF9R_uT1012gsa2Ww',
        genre: 'Indie Rock',
      },
      {
        name: 'Winyah',
        link: 'https://open.spotify.com/artist/4iyP4VOGOLzbt2Vxcyu6zG?si=KYUpyi0WRO-0G6fCyrffGw',
        genre: 'Indie Rock',
      },
      {
        name: 'Quevedo',
        link: 'https://open.spotify.com/artist/52iwsT98xCoGgiGntTiR7K?si=WNv9SHONTki7_3Tk-N8wng',
        genre: 'Reggaeton',
      },
      {
        name: 'Sam Barber',
        link: 'https://open.spotify.com/artist/08GfvCW09pv2QP4y9sle2a?si=1ESM3SocQU23xTEdkoWikA',
        genre: 'Folk/Country',
      },
      {
        name: 'Zulan',
        link: 'https://open.spotify.com/artist/2Yz9F5lQVc0p6SDxkw2BvF?si=pz-nqi5mQFWm-Nj80WK3Ng',
        genre: 'House Latino',
      },
      {
        name: 'Pescado Rabioso',
        link: 'https://open.spotify.com/artist/3q1NXsv9XypOUCJfEatXH9?si=R2JsNhcTSdyHDIQZuYjRxg',
        genre: 'Rock Latino',
      },
      {
        name: 'Nighty Noise',
        link: 'https://open.spotify.com/artist/5jf1AJPDmVVMVw7DUOG3Jt?si=qqVitp5ISS-c6VOg6SMixg',
        genre: 'House Latino',
        album: 'Loquito Por ti',
        albumLink:
          'https://open.spotify.com/album/4aTn8g92Qv159GVkKFOWgl?si=i_ZBO3RlQty8dNKvLK_E4w',
      },
      {
        name: 'The Band',
        link: 'https://open.spotify.com/artist/4vpDg7Y7fU982Ds30zawDA?si=IWprdvUyRHOzLRukD_H4NA',
        genre: 'Rock',
      },
      {
        name: 'Jack Van Cleaf',
        link: 'https://open.spotify.com/artist/7nW46aJfNHxK9Y3M5Dhadk?si=-QWKwyX0TyuMZo2tyGRXXA',
        genre: 'Folk/Country',
      },
      {
        name: 'Alleh y Yorghaki',
        link: 'https://open.spotify.com/artist/4eq1q0o9XPyNq9RG3fNDD1?si=VFBZtSy8RLeyN0_-1LwkwA',
        genre: 'Reggaeton',
      },
      {
        name: 'Bad Bunny',
        link: 'https://open.spotify.com/artist/4q3ewBCX7sLwd24euuV69X?si=_-f46akAQRalbtVjQnLjwQ',
        genre: 'Reggaeton',
        album: 'DeBÍ TiRAR MáS FOToS',
        albumLink:
          'https://open.spotify.com/album/5K79FLRUCSysQnVESLcTdb?si=JgPqaHmkR923xkSbKQVu5w',
      },
    ],
  },
  '2024': {
    index: 2,
    items: [
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
  },
} as const;

interface WatchItem {
  name: string;
  link: string;
  description?: string;
}

type Watching = {
  currently: ListStage<WatchItem>;
  podcasts: ListStage<WatchItem>;
  movies: ListStage<WatchItem>;
  shows: ListStage<WatchItem>;
};

export const WATCHING: Watching = {
  currently: {
    index: 0,
    items: [
      {
        name: 'Suits',
        link: 'https://www.disneyplus.com/browse/entity-16ced814-5ed7-4f3c-9b8d-0660a12fc2ee?distributionPartner=google',
      },
      {
        name: 'Anthony Bourdain: Parts Unknown',
        link: 'https://www.primevideo.com/dp/amzn1.dv.gti.28baa2f2-f652-04f1-77cf-226eb28fc7d8?autoplay=0&ref_=atv_cf_strg_wb',
      },
      {
        name: 'How About Tomorrow?',
        link: 'https://tomorrow.fm/',
      },
    ],
  },
  podcasts: {
    index: 1,
    items: [
      {
        name: 'WAR MODE',
        link: 'https://open.spotify.com/show/3mPoh0V6S7qwjZDGOUE2BE?si=3017e7a44ef94192',
      },
      {
        name: "Matt and Shane's Secret Podcast",
        link: 'https://open.spotify.com/show/32p08HngccrVVyugc45Ljp?si=0f04db4a259a495c',
      },
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
  },
  movies: {
    index: 2,
    items: [
      {
        name: 'The Penguin Lessons',
        link: 'https://www.imdb.com/title/tt26677014/',
      },
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
  },
  shows: {
    index: 3,
    items: [
      {
        name: 'Vice Principals',
        link: 'https://play.hbomax.com/show/9714271a-a41c-4321-be01-3287f450528e?utm_source=universal_search',
      },
      {
        name: 'The Penguin',
        link: 'https://play.max.com/show/5756c2bf-36f8-4890-b1f9-ef168f1d8e9c',
      },
      {
        name: 'Ministerio del Tiempo',
        link: 'https://www.amazon.com/El-ministerio-del-tiempo-Season/dp/B09JV86JF2',
      },
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
  },
} as const;
