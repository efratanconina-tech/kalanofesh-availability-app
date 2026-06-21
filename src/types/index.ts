export type AvailabilityStatus = 'available' | 'booked' | 'tentative' | 'offered' | 'check' | 'maintenance';
export type InvoiceStatus = 'not_sent' | 'sent' | 'end_of_stay';
export type LeadStatus = 'new' | 'in_progress' | 'waiting' | 'closed' | 'irrelevant';
export type OfferStatus = 'offered' | 'interested' | 'rejected' | 'closed';
export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export interface Complex {
  id: string;
  name: string;
  area: string;
  city: string;
  rooms: number;
  maxGuests: number;
  ownerName?: string;
  ownerPhone?: string;
  coverImageUrl?: string;
  videoUrl?: string;
  galleryUrls?: string;
  salesNote?: string;
  priceWeekday?: string;
  priceShabbat?: string;
  priceWeekend?: string;
  priceBeinHazmanim?: string;
  priceHoliday?: string;
  priceNotes?: string;
  internalNotes?: string;
  shabbatNotes?: string;
  active: boolean;
}

export interface AvailabilityBlock {
  id: string;
  complexId: string;
  startDate: string;
  endDate: string;
  status: AvailabilityStatus;
  leadId?: string;
  customerName?: string;
  customerPhone?: string;
  commissionAmount?: string;
  commissionPaid?: boolean;
  invoiceSent?: boolean;
  invoiceStatus?: InvoiceStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  customerName: string;
  customerPhone: string;
  startDate?: string;
  endDate?: string;
  parsha?: string;
  guests: number;
  areaPreference: string;
  vacationType: string;
  budget?: string;
  notes?: string;
  status: LeadStatus;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadOffer {
  id: string;
  leadId: string;
  complexId: string;
  status: OfferStatus;
  note?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  leadId?: string;
  complexId?: string;
  dueDate: string;
  status: 'open' | 'done';
  assignedTo?: string;
  createdAt: string;
}

export interface AppState {
  users: User[];
  complexes: Complex[];
  availabilityBlocks: AvailabilityBlock[];
  leads: Lead[];
  leadOffers: LeadOffer[];
  tasks: Task[];
}
