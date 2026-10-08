import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RequestStatus } from './admin.service';

export type Sector =
  | 'BANK'
  | 'TELECOM'
  | 'HEALTH'
  | 'PUBLIC'
  | 'EDUCATION'
  | 'STARTUP'
  | 'RESEARCH'
  | 'OTHER';

export type UsageKind = 'COMMERCIAL' | 'RESEARCH';

/** Corps d'une demande : le statut, le devis et le demandeur sont fixés par le serveur. */
export interface NewDatasetRequest {
  orgName: string;
  sector: Sector;
  languageCode: string;
  hours: number;
  speakersTarget: number | null;
  conversationType: string | null;
  usageKind: UsageKind;
  deadline: string | null;
  description: string | null;
}

export interface MyRequest {
  id: number;
  orgName: string;
  sector: Sector;
  languageCode: string | null;
  languageName: string | null;
  hours: number;
  speakersTarget: number | null;
  conversationType: string | null;
  usageKind: UsageKind;
  deadline: string | null;
  description: string | null;
  status: RequestStatus;
  quoteAmountFcfa: number | null;
  createdAt: string;
}

export const SECTORS: readonly Sector[] = [
  'BANK',
  'TELECOM',
  'HEALTH',
  'PUBLIC',
  'EDUCATION',
  'STARTUP',
  'RESEARCH',
  'OTHER',
];

/** Appels de l'espace organisation (`/api/me/requests`). */
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly http = inject(HttpClient);

  mine(): Observable<MyRequest[]> {
    return this.http.get<MyRequest[]>('/api/me/requests');
  }

  submit(request: NewDatasetRequest): Observable<MyRequest> {
    return this.http.post<MyRequest>('/api/me/requests', request);
  }
}
