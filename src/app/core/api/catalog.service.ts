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

export interface DurationBucket {
  fromSec: number;
  /** `null` pour la dernière tranche (ouverte). */
  toSec: number | null;
  count: number;
}

export interface TextStats {
  meanChars: number;
  meanWords: number;
  totalWords: number;
  vocabulary: number;
}

export interface TechStats {
  recordings: number;
  speakers: number;
  hours: number;
  minSec: number;
  meanSec: number;
  medianSec: number;
  maxSec: number;
  minPerSpeaker: number;
  medianPerSpeaker: number;
  maxPerSpeaker: number;
  durationHistogram: DurationBucket[];
  text: TextStats;
}

export interface SplitStat {
  name: 'train' | 'dev' | 'test';
  recordings: number;
  speakers: number;
  hours: number;
}

export interface AudioFormatView {
  container: string;
  sampleRateHz: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  encoding: string | null;
  /** Fichiers de l'échantillon d'en-têtes lus qui ont ce format. */
  filesInspected: number;
}

export interface ArchiveFile {
  path: string;
  sizeBytes: number;
}

/** Vue technique d'une version, lue dans l'archive publiée (voir DatasetTechnicalService). */
export interface DatasetTechnical {
  slug: string;
  version: string;
  license: LicenseKind;
  publishedAt: string;
  sha256: string;
  archiveBytes: number;
  stats: TechStats;
  splits: SplitStat[];
  audioFormats: AudioFormatView[];
  columns: string[];
  files: ArchiveFile[];
  audioFiles: number;
  audioBytes: number;
  models: ModelSummary[];
}

export interface PreviewRow {
  id: number;
  file: string;
  speaker: string;
  durationMs: number;
  text: string;
  split: string;
}

export interface DatasetDetail {
  dataset: DatasetSummary;
  versions: VersionView[];
}

/** Une version de dataset citée par un modèle. */
export interface DatasetRef {
  slug: string;
  title: string;
  version: string;
}

/** Une version publiée, proposée dans le formulaire de publication d'un modèle. */
export interface VersionOption {
  id: number;
  slug: string;
  title: string;
  version: string;
  languageCode: string | null;
}

export interface ModelSummary {
  id: number;
  name: string;
  task: MlTask;
  description: string | null;
  license: string | null;
  url: string | null;
  sha256: string | null;
  downloads: number | null;
  createdAt: string;
  ownerName: string | null;
  languageCode: string | null;
  languageName: string | null;
  trainedOnDataset: string | null;
  trainedOnVersion: string | null;
  otherDatasets: DatasetRef[];
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
  /** Empreinte SHA-256 facultative du fichier pointé par `url` (vide = non renseignée). */
  sha256: string;
  languageCode: string;
  /** Dataset principal (id de version publiée), `null` si non précisé. */
  trainedOnVersionId: number | null;
  /** Autres versions utilisées ; le serveur exige un dataset principal pour en accepter. */
  otherVersionIds: number[];
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

  dataset(slug: string): Observable<DatasetDetail> {
    return this.http.get<DatasetDetail>(`/api/public/datasets/${encodeURIComponent(slug)}`);
  }

  /** Statistiques techniques d'une version (la dernière si `version` est omis) ; 404 sans version publiée. */
  technical(slug: string, version?: string): Observable<DatasetTechnical> {
    return this.http.get<DatasetTechnical>(`/api/public/datasets/${encodeURIComponent(slug)}/technical`, {
      params: toParams({ version }),
    });
  }

  /** Premières lignes (texte et durée, sans audio) ; exige un compte connecté. */
  preview(slug: string, version?: string): Observable<PreviewRow[]> {
    return this.http.get<PreviewRow[]>(`/api/catalog/datasets/${encodeURIComponent(slug)}/preview`, {
      params: toParams({ version }),
    });
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

  /** Versions publiées dont le dataset correspond au texte (titre ou slug) ; 20 résultats au plus. */
  datasetVersions(q: string): Observable<VersionOption[]> {
    return this.http.get<VersionOption[]>('/api/public/dataset-versions', { params: toParams({ q }) });
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
