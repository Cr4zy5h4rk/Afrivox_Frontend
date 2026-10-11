import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type ConsentKind = 'COLLECTION' | 'RESALE' | 'FREE_DISTRIBUTION' | 'VOICE_LICENSING';

export interface ConsentRecord {
  id: number;
  kind: ConsentKind;
  policyVersion: string;
  grantedAt: string;
  revokedAt: string | null;
}

/** Campagne ouverte, avec ma progression (calculée par le serveur). */
export interface CampaignView {
  id: number;
  title: string;
  description: string | null;
  domain: string | null;
  languageCode: string | null;
  languageName: string | null;
  script: string | null;
  direction: 'LTR' | 'RTL' | null;
  totalPrompts: number;
  recordedByMe: number;
}

export interface PromptView {
  id: number;
  content: string;
}

export type ContributorStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED';

/** Ma période d'essai : état, plafond, et ce qui est déjà envoyé ou relu (calculé par le serveur). */
export interface TrialView {
  status: ContributorStatus;
  limit: number;
  used: number;
  pending: number;
  validated: number;
  rejected: number;
}

export type AgeRange = 'R18_25' | 'R26_35' | 'R36_45' | 'R46_60' | 'R61_PLUS';
export type Gender = 'FEMALE' | 'MALE' | 'OTHER';

/** Ce que le contributeur a déclaré ; `complete` : âge, genre, pays et région sont renseignés (obligatoire pour enregistrer). */
export interface ContributorProfile {
  complete: boolean;
  nativeLanguage: string | null;
  ageRange: AgeRange | null;
  gender: Gender | null;
  country: string | null;
  region: string | null;
  otherLanguages: string[];
}

export interface ContributorProfileInput {
  ageRange: AgeRange | null;
  gender: Gender | null;
  country: string;
  region: string;
  otherLanguages: string[];
}

/** Extension de fichier pour un type MIME de MediaRecorder (le serveur vérifie de toute façon le contenu). */
export function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('wav')) return 'wav';
  return 'bin';
}

/** Appels de l'espace contributeur (`/api/me/...` et `/api/consents`). */
@Injectable({ providedIn: 'root' })
export class ContributionService {
  private readonly http = inject(HttpClient);

  consents(): Observable<ConsentRecord[]> {
    return this.http.get<ConsentRecord[]>('/api/consents');
  }

  grantConsent(kind: ConsentKind): Observable<ConsentRecord> {
    return this.http.post<ConsentRecord>('/api/consents', { kind });
  }

  /** Retire un consentement : on ne supprime rien, la date de retrait est enregistrée. */
  revokeConsent(id: number): Observable<ConsentRecord> {
    return this.http.post<ConsentRecord>(`/api/consents/${id}/revoke`, {});
  }

  trial(): Observable<TrialView> {
    return this.http.get<TrialView>('/api/me/contributor');
  }

  contributorProfile(): Observable<ContributorProfile> {
    return this.http.get<ContributorProfile>('/api/me/contributor/profile');
  }

  saveContributorProfile(input: ContributorProfileInput): Observable<ContributorProfile> {
    return this.http.put<ContributorProfile>('/api/me/contributor/profile', input);
  }

  openCampaigns(): Observable<CampaignView[]> {
    return this.http.get<CampaignView[]>('/api/me/campaigns');
  }

  /** Prochaines phrases non enregistrées ; liste vide = campagne terminée pour moi. */
  todo(campaignId: number, limit = 10): Observable<PromptView[]> {
    return this.http.get<PromptView[]>(`/api/me/campaigns/${campaignId}/todo`, {
      params: { limit },
    });
  }

  upload(promptId: number, durationMs: number, audio: Blob, mimeType: string): Observable<unknown> {
    const form = new FormData();
    form.append('promptId', String(promptId));
    form.append('durationMs', String(Math.round(durationMs)));
    form.append('file', audio, `recording.${extensionFor(mimeType)}`);
    return this.http.post('/api/me/recordings', form);
  }
}
