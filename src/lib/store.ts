import { seedState } from '../data/seed';
import type { AppState, AvailabilityBlock, Lead, LeadOffer, Task } from '../types';

const STORAGE_KEY = 'kalanofesh-availability-app-v1';

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(seedState);
    const parsed = JSON.parse(raw) as AppState;
    return {
      ...clone(seedState),
      ...parsed,
      complexes: parsed.complexes?.length ? parsed.complexes : clone(seedState.complexes),
    };
  } catch {
    return clone(seedState);
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

export function hasDateConflict(block: AvailabilityBlock, startDate: string, endDate: string): boolean {
  return block.startDate < endDate && block.endDate > startDate;
}
