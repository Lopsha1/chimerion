export type Content = {
  studio: {
    name: string;
    tagline: string;
    about: string;
    phone: string;
    address: string;
    vk: string;
    telegram: string;
    hours_label: string;
  };
  zones: Array<{ id: string; title: string; summary: string; stations: number; specs: string[] }>;
  services: ServiceView[];
  gallery: Array<{ id: string; src: string; alt: string; caption: string; sort: number }>;
  promos: Array<{ id: string; title: string; text: string; condition: string; image: string | null }>;
  reviews: Array<{ id: string; author: string; text: string; source: string }>;
};

export type ServiceView = {
  id: string;
  title: string;
  summary: string;
  durationMin: number;
  rules: {
    guests: "fixed" | "multiplier";
    minGuests: number;
    maxGuests: number;
    startHours: number[] | null;
  };
  price: { type: string; dayRub?: number; nightRub?: number; weekdayRub?: number; weekendRub?: number; dayFrom?: number; dayTo?: number };
  active: boolean;
  sourceNote: string;
  pricePreview: string;
  bookable: boolean;
};

export type Slot = { start: string; label: string; priceRub: number | null; priceLabel: string };

export type Booking = {
  id: string;
  serviceTitle: string;
  localStart: string;
  localEnd: string;
  guestName: string;
  guestPhone?: string;
  guests: number;
  comment: string;
  priceRub: number | null;
  priceLabel: string;
  status: string;
  resources: string[];
  token?: string;
  start: string;
};
