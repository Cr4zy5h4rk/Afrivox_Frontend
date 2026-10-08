import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type DatasetPlan = 'STARTER' | 'PLUS' | 'PRO';
export type LicenseKind = 'PROTOTYPE' | 'RESEARCH' | 'COMMERCIAL';
export type MlTask = 'ASR' | 'TTS' | 'INTENT' | 'OTHER';

export interface Stats {
  activeLanguages: number;
  contributors: number;
  recordingsReceived: number;
  recordingsValidated: number;
  validatedHours: number;
  publishedDatasets: number;
  models: number;
}

export interface LanguageView {
  code: string;
  name: string;
  script: string;
  direction: 'LTR' | 'RTL';
  status: 'WAITLIST' | 'ACTIVE';
  minValidators: number;
  validatedRecordings: number;
}

export interface VersionView {
  label: string;
  hours: number | null;
  speakers: number | null;
  qualityScore: number | null;
  pricePerHourFcfa: number | null;
  license: LicenseKind;
  createdAt: string;
}

export interface DatasetSummary {
  slug: string;
  title: string;
  description: string | null;
  domain: string | null;
  plan: DatasetPlan;
  languageCode: string | null;
  languageName: string | null;
  published: boolean;
  latestVersion: VersionView | null;
  validatedRecordings: number;
  validatedHours: number;
}

export interface DatasetDetail {
  dataset: DatasetSummary;
  versions: VersionView[];
}

export interface ModelSummary {
  id: number;
  name: string;
  task: MlTask;
  description: string | null;
  license: string | null;
  url: string | null;
  downloads: number | null;
  createdAt: string;
  ownerName: string | null;
  languageCode: string | null;
  languageName: string | null;
  trainedOnDataset: string | null;
  trainedOnVersion: string | null;
  bestWer: number | null;
}

export interface EvaluationRow {
  modelId: number;
  modelName: string;
  task: MlTask;
  languageCode: string | null;
  languageName: string | null;
  wer: number | null;
  cer: number | null;
  testSetDataset: string | null;
  testSetVersion: string | null;
  submittedAt: string;
}

export interface ModelDetail {
  model: ModelSummary;
  evaluations: EvaluationRow[];
}

export interface PageView<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
  pages: number;
}

export interface NewModel {
  name: string;
  task: MlTask;
  description: string;
  license: string;
  url: string;
  languageCode: string;
}

/** Catalogue public (`/api/public/**`, sans connexion) et publication de modèles (`/api/me/models`). */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);

  stats(): Observable<Stats> {
    return this.http.get<Stats>('/api/public/stats');
  }

  languages(): Observable<LanguageView[]> {
    return this.http.get<LanguageView[]>('/api/public/languages');
  }

  datasets(filters: {
    q?: string;
    language?: string;
    plan?: string;
    page?: number;
    size?: number;
  }): Observable<PageView<DatasetSummary>> {
    return this.http.get<PageView<DatasetSummary>>('/api/public/datasets', {
      params: toParams(filters),
    });
  }

  /** Lien de téléchargement signé et expirant (réservé aux comptes connectés autorisés). */
  downloadLink(slug: string, label: string): Observable<{ url: string; expiresAt: string }> {
    return this.http.post<{ url: string; expiresAt: string }>(
      `/api/me/downloads/${encodeURIComponent(slug)}/${encodeURIComponent(label)}/link`,
      {},
    );
  }

  dataset(slug: string): Observable<DatasetDetail> {
    return this.http.get<DatasetDetail>(`/api/public/datasets/${encodeURIComponent(slug)}`);
  }

  models(filters: {
    q?: string;
    task?: string;
    language?: string;
    page?: number;
    size?: number;
  }): Observable<PageView<ModelSummary>> {
    return this.http.get<PageView<ModelSummary>>('/api/public/models', {
      params: toParams(filters),
    });
  }

  model(id: number): Observable<ModelDetail> {
    return this.http.get<ModelDetail>(`/api/public/models/${id}`);
  }

  leaderboard(language?: string): Observable<EvaluationRow[]> {
    return this.http.get<EvaluationRow[]>('/api/public/leaderboard', {
      params: toParams({ language }),
    });
  }

  publishModel(model: NewModel): Observable<ModelSummary> {
    return this.http.post<ModelSummary>('/api/me/models', model);
  }
}

/** Ne garde que les filtres renseignés (pas de `?q=&plan=` vides dans l'URL). */
function toParams(values: Record<string, string | number | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}
