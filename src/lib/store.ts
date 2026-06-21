import { seedState } from '../data/seed';
import type { AppState, AvailabilityBlock, Complex, Lead, LeadOffer, Task } from '../types';

const STORAGE_KEY = 'kalanofesh-availability-app-v1';
const REMOVED_COMPLEX_IDS = new Set(['bresheet', 'pninat-hagalil']);
const BOUTIQUE_HAMAYAN_GALLERY = [
  '/media/complexes/boutique-hamayan/cover.jpg',
  '/media/complexes/boutique-hamayan/photo-01.jpg',
  '/media/complexes/boutique-hamayan/photo-02.jpg',
  '/media/complexes/boutique-hamayan/photo-03.jpg',
  '/media/complexes/boutique-hamayan/photo-04.jpg',
  '/media/complexes/boutique-hamayan/photo-05.jpg',
  '/media/complexes/boutique-hamayan/photo-06.jpg',
  '/media/complexes/boutique-hamayan/photo-07.jpg',
  '/media/complexes/boutique-hamayan/photo-08.jpg',
  '/media/complexes/boutique-hamayan/photo-09.jpg',
  '/media/complexes/boutique-hamayan/photo-10.png',
  '/media/complexes/boutique-hamayan/photo-11.jpg',
  '/media/complexes/boutique-hamayan/pool.jpg',
  '/media/complexes/boutique-hamayan/jacuzzi.jpg',
  '/media/complexes/boutique-hamayan/room.png',
  '/media/complexes/boutique-hamayan/outside-01.png',
  '/media/complexes/boutique-hamayan/outside-02.png',
  '/media/complexes/boutique-hamayan/outside-03.png',
  '/media/complexes/boutique-hamayan/outside-04.png',
  '/media/complexes/boutique-hamayan/outside-05.png',
  '/media/complexes/boutique-hamayan/outside-06.png',
  '/media/complexes/boutique-hamayan/kitchen.png',
  '/media/complexes/boutique-hamayan/hallway.png',
  '/media/complexes/boutique-hamayan/living-room.png',
  '/media/complexes/boutique-hamayan/bathroom.png',
];
const ICON_GALLERY = [
  '/media/complexes/icon/cover.jpg',
  '/media/complexes/icon/photo-01.jpg',
  '/media/complexes/icon/photo-02.jpg',
  '/media/complexes/icon/photo-03.jpg',
  '/media/complexes/icon/photo-04.jpg',
  '/media/complexes/icon/photo-05.jpg',
  '/media/complexes/icon/photo-06.jpg',
  '/media/complexes/icon/photo-07.jpg',
];

const DEFAULT_COMPLEX_MEDIA: Record<string, Pick<Complex, 'coverImageUrl' | 'videoUrl' | 'galleryUrls'>> = {
  'boutique-hamayan': {
    coverImageUrl: '/media/complexes/boutique-hamayan/cover.jpg',
    videoUrl: '/media/complexes/boutique-hamayan/video-tour.mp4',
    galleryUrls: BOUTIQUE_HAMAYAN_GALLERY.join('\n'),
  },
  icon: {
    coverImageUrl: '/media/complexes/icon/cover.jpg',
    videoUrl: '/media/complexes/icon/video-tour.mp4',
    galleryUrls: ICON_GALLERY.join('\n'),
  },
};

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function withoutRemovedComplexes(state: AppState): AppState {
  return {
    ...state,
    complexes: state.complexes
      .filter(complex => !REMOVED_COMPLEX_IDS.has(complex.id))
      .map(complex => {
        const defaults = DEFAULT_COMPLEX_MEDIA[complex.id];
        if (!defaults) return complex;

        return {
          ...complex,
          coverImageUrl: complex.coverImageUrl || defaults.coverImageUrl,
          videoUrl: complex.videoUrl || defaults.videoUrl,
          galleryUrls: complex.galleryUrls || defaults.galleryUrls,
        };
      }),
    availabilityBlocks: state.availabilityBlocks.filter(block => !REMOVED_COMPLEX_IDS.has(block.complexId)),
    leadOffers: state.leadOffers.filter(offer => !REMOVED_COMPLEX_IDS.has(offer.complexId)),
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return withoutRemovedComplexes(clone(seedState));
    const parsed = JSON.parse(raw) as AppState;
    const parsedAvailabilityIds = new Set((parsed.availabilityBlocks ?? []).map(block => block.id));
    const seededAvailability = clone(seedState.availabilityBlocks).filter(block => !parsedAvailabilityIds.has(block.id));
    return withoutRemovedComplexes({
      ...clone(seedState),
      ...parsed,
      complexes: parsed.complexes?.length ? parsed.complexes : clone(seedState.complexes),
      availabilityBlocks: [...seededAvailability, ...(parsed.availabilityBlocks ?? [])],
    });
  } catch {
    return withoutRemovedComplexes(clone(seedState));
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createAvailabilityBlock(
  state: AppState,
  data: Omit<AvailabilityBlock, 'id' | 'createdAt' | 'updatedAt'>,
): AppState {
  const block: AvailabilityBlock = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now(),
    updatedAt: now(),
  };

  return { ...state, availabilityBlocks: [...state.availabilityBlocks, block] };
}

export function createLead(state: AppState, data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): AppState {
  const lead: Lead = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now(),
    updatedAt: now(),
  };

  return { ...state, leads: [lead, ...state.leads] };
}

export function createOffer(state: AppState, data: Omit<LeadOffer, 'id' | 'createdAt'>): AppState {
  const offer: LeadOffer = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now(),
  };

  return { ...state, leadOffers: [offer, ...state.leadOffers] };
}

export function completeTask(state: AppState, taskId: string): AppState {
  return {
    ...state,
    tasks: state.tasks.map(task => task.id === taskId ? { ...task, status: 'done' } : task),
  };
}

export function createTask(state: AppState, data: Omit<Task, 'id' | 'createdAt' | 'status'>): AppState {
  const task: Task = {
    ...data,
    id: crypto.randomUUID(),
    status: 'open',
    createdAt: now(),
  };

  return { ...state, tasks: [task, ...state.tasks] };
}

function endExclusive(startDate: string, endDate: string): string {
  if (endDate > startDate) return endDate;
  const date = new Date(`${startDate}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function hasDateConflict(block: AvailabilityBlock, startDate: string, endDate: string): boolean {
  const blockEnd = endExclusive(block.startDate, block.endDate);
  const requestedEnd = endExclusive(startDate, endDate);
  return block.startDate < requestedEnd && blockEnd > startDate;
}
