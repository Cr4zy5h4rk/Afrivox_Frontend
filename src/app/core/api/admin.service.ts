import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, forkJoin, from, map, of, reduce } from 'rxjs';

/** Requêtes envoyées en même temps lors de l'ajout de phrases. */
const PARALLEL_REQUESTS = 10;

export type RequestStatus =
  | 'RECEIVED'
  | 'IN_REVIEW'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'COLLECTING'
  | 'DELIVERED'
  | 'REJECTED';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';
export type CampaignKind = 'OPEN' | 'SPONSORED' | 'PRIVATE';

/** Ordre du parcours d'une demande ; REJECTED est possible à tout moment. */
export const REQUEST_FLOW: readonly RequestStatus[] = [
  'RECEIVED',
  'IN_REVIEW',
  'QUOTED',
  'ACCEPTED',
  'COLLECTING',
  'DELIVERED',
];

export interface AdminLanguage {
  id: number;
  code: string;
  name: string;
}

export interface AdminRequest {
  id: number;
  orgName: string;
  sector: string;
  hours: number;
  speakersTarget: number | null;
  conversationType: string | null;
  usageKind: string;
  deadline: string | null;
  description: string | null;
  status: RequestStatus;
  quoteAmountFcfa: number | null;
  createdAt: string;
  language: AdminLanguage | null;
  /** Identifiant du compte demandeur. */
  requesterLogin: string | null;
}

export interface AdminRequestFilter {
  query: string;
  status: RequestStatus | '';
  sector: string;
  languageId: number | null;
  usageKind: 'COMMERCIAL' | 'RESEARCH' | '';
}

export interface AdminRequestPage {
  items: AdminRequest[];
  total: number;
}

export interface AdminCampaign {
  id: number;
  title: string;
  description: string | null;
  domain: string | null;
  kind: CampaignKind;
  status: CampaignStatus;
  targetSentences: number | null;
  createdAt: string;
  language: AdminLanguage | null;
}

/** Campagne avec ses compteurs, telle que renvoyée par `/api/admin/campaigns`. */
export interface AdminCampaignRow {
  id: number;
  title: string;
  description: string | null;
  domain: string | null;
  kind: CampaignKind;
  status: CampaignStatus;
  targetSentences: number | null;
  createdAt: string;
  languageId: number | null;
  languageName: string | null;
  prompts: number;
  recordingsSubmitted: number;
  recordingsValidated: number;
  recordingsRejected: number;
}

export interface AdminCampaignFilter {
  query: string;
  languageId: number | null;
  kind: CampaignKind | '';
  status: CampaignStatus | '';
  domain: string;
}

export interface AdminCampaignPage {
  items: AdminCampaignRow[];
  total: number;
}

export interface NewCampaign {
  title: string;
  description: string;
  domain: string;
  kind: CampaignKind;
  targetSentences: number | null;
  languageId: number;
}

/**
 * Appels de l'espace d'administration. Ils s'appuient sur le CRUD généré côté serveur,
 * réservé à ROLE_ADMIN (SecurityConfiguration) : un non-admin recevrait 403.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  /** Une page de demandes filtrée côté serveur (récentes d'abord). */
  requestOverview(filter: AdminRequestFilter, page: number, size: number): Observable<AdminRequestPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (filter.query.trim()) params = params.set('q', filter.query.trim());
    if (filter.status) params = params.set('status', filter.status);
    if (filter.sector) params = params.set('sector', filter.sector);
    if (filter.languageId !== null) params = params.set('languageId', filter.languageId);
    if (filter.usageKind) params = params.set('usageKind', filter.usageKind);
    return this.http
      .get<AdminRequest[]>('/api/admin/requests', { params, observe: 'response' })
      .pipe(
        map((response) => ({
          items: response.body ?? [],
          total: Number(response.headers.get('X-Total-Count') ?? response.body?.length ?? 0),
        })),
      );
  }

  /** Mise à jour partielle (PATCH) : seuls le statut et le montant du devis changent. */
  updateRequest(
    id: number,
    change: { status: RequestStatus; quoteAmountFcfa?: number | null },
  ): Observable<AdminRequest> {
    return this.http.patch<AdminRequest>(`/api/dataset-requests/${id}`, { id, ...change });
  }

  languages(): Observable<AdminLanguage[]> {
    return this.http.get<AdminLanguage[]>('/api/languages');
  }

  campaigns(): Observable<AdminCampaign[]> {
    return this.http
      .get<AdminCampaign[]>('/api/campaigns')
      .pipe(map((list) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
  }

  /** Une page de campagnes avec compteurs, filtrée côté serveur (récentes d'abord). */
  campaignOverview(filter: AdminCampaignFilter, page: number, size: number): Observable<AdminCampaignPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (filter.query.trim()) params = params.set('q', filter.query.trim());
    if (filter.languageId !== null) params = params.set('languageId', filter.languageId);
    if (filter.kind) params = params.set('kind', filter.kind);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.domain) params = params.set('domain', filter.domain);
    return this.http
      .get<AdminCampaignRow[]>('/api/admin/campaigns', { params, observe: 'response' })
      .pipe(
        map((response) => ({
          items: response.body ?? [],
          total: Number(response.headers.get('X-Total-Count') ?? response.body?.length ?? 0),
        })),
      );
  }

  campaignDomains(): Observable<string[]> {
    return this.http.get<string[]>('/api/admin/campaigns/domains');
  }

  /** Modifie la fiche d'une campagne ; langue et type ne changent plus (des enregistrements s'y rattachent). */
  updateCampaign(
    id: number,
    change: { title: string; description: string | null; domain: string | null; targetSentences: number | null },
  ): Observable<unknown> {
    return this.http.patch(`/api/campaigns/${id}`, { id, ...change });
  }

  /** Une nouvelle campagne naît en brouillon : elle n'est visible des contributeurs qu'une fois activée. */
  createCampaign(input: NewCampaign): Observable<AdminCampaign> {
    return this.http.post<AdminCampaign>('/api/campaigns', {
      title: input.title,
      description: input.description || null,
      domain: input.domain || null,
      kind: input.kind,
      status: 'DRAFT' satisfies CampaignStatus,
      targetSentences: input.targetSentences,
      createdAt: new Date().toISOString(),
      language: { id: input.languageId },
    });
  }

  setCampaignStatus(id: number, status: CampaignStatus): Observable<AdminCampaign> {
    return this.http.patch<AdminCampaign>(`/api/campaigns/${id}`, { id, status });
  }

  /**
   * Ajoute des phrases à une campagne, par lots de 10 requêtes en parallèle.
   * Renvoie les phrases **qui ont échoué** (liste vide = tout est passé) : l'appelant peut ainsi
   * les proposer à nouveau sans recréer de doublons parmi celles déjà enregistrées.
   */
  addPrompts(campaignId: number, sentences: string[]): Observable<string[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < sentences.length; i += PARALLEL_REQUESTS) {
      chunks.push(sentences.slice(i, i + PARALLEL_REQUESTS));
    }
    return from(chunks).pipe(
      concatMap((chunk) =>
        forkJoin(
          chunk.map((content) =>
            this.http.post('/api/prompts', { content, campaign: { id: campaignId } }).pipe(
              map(() => null),
              catchError(() => of(content)),
            ),
          ),
        ),
      ),
      reduce(
        (failed: string[], results) => failed.concat(results.filter((r): r is string => r !== null)),
        [],
      ),
    );
  }

  languageOverview(): Observable<AdminLanguageOverview[]> {
    return this.http.get<AdminLanguageOverview[]>('/api/admin/languages');
  }

  /** Une nouvelle langue commence toujours en liste d'attente : elle s'active quand le seuil est atteint. */
  createLanguage(input: NewLanguage): Observable<unknown> {
    return this.http.post('/api/languages', {
      code: input.code,
      name: input.name,
      dialect: input.dialect || null,
      script: input.script,
      direction: input.direction,
      status: 'WAITLIST' satisfies LanguageStatus,
      minValidators: input.minValidators,
    });
  }

  updateLanguage(
    id: number,
    change: { status?: LanguageStatus; minValidators?: number },
  ): Observable<unknown> {
    return this.http.patch(`/api/languages/${id}`, { id, ...change });
  }

  datasets(): Observable<AdminDataset[]> {
    return this.http.get<AdminDataset[]>('/api/datasets');
  }

  createDataset(input: NewDataset): Observable<AdminDataset> {
    return this.http.post<AdminDataset>('/api/datasets', {
      slug: input.slug,
      title: input.title,
      description: input.description || null,
      domain: input.domain || null,
      plan: input.plan,
      language: { id: input.languageId },
    });
  }

  /** Fige les enregistrements éligibles dans une archive et publie la version (le serveur calcule heures et locuteurs). */
  publishVersion(datasetId: number, input: NewVersion): Observable<PublishedVersion> {
    return this.http.post<PublishedVersion>(`/api/admin/datasets/${datasetId}/versions`, input);
  }

  /** Une page de datasets avec leurs versions et compteurs, filtrée côté serveur (titre A→Z). */
  datasetOverview(filter: AdminDatasetFilter, page: number, size: number): Observable<AdminDatasetPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (filter.query.trim()) params = params.set('q', filter.query.trim());
    if (filter.languageId !== null) params = params.set('languageId', filter.languageId);
    if (filter.plan) params = params.set('plan', filter.plan);
    if (filter.domain) params = params.set('domain', filter.domain);
    if (filter.published !== null) params = params.set('published', filter.published);
    return this.http
      .get<AdminDatasetRow[]>('/api/admin/datasets', { params, observe: 'response' })
      .pipe(
        map((response) => ({
          items: response.body ?? [],
          total: Number(response.headers.get('X-Total-Count') ?? response.body?.length ?? 0),
        })),
      );
  }

  datasetDomains(): Observable<string[]> {
    return this.http.get<string[]>('/api/admin/datasets/domains');
  }

  /** Modifie la fiche (titre, description, domaine, formule) ; l'adresse (slug) et la langue ne changent plus. */
  updateDataset(
    id: number,
    change: { title: string; description: string | null; domain: string | null; plan: DatasetPlanKind },
  ): Observable<unknown> {
    return this.http.patch(`/api/datasets/${id}`, { id, ...change });
  }

  /** Retire (WITHDRAWN) ou remet en ligne (PUBLISHED) une version ; son contenu ne change jamais. */
  setVersionStatus(versionId: number, status: 'PUBLISHED' | 'WITHDRAWN'): Observable<unknown> {
    return this.http.put(`/api/admin/datasets/versions/${versionId}/status`, { status });
  }

  /** Fixe le tarif horaire d'une version publiée ; les achats déjà faits gardent leur prix. */
  setVersionPrice(versionId: number, pricePerHourFcfa: number): Observable<unknown> {
    return this.http.put(`/api/admin/datasets/versions/${versionId}/price`, { pricePerHourFcfa });
  }

  /** Une page d'utilisateurs, les plus récents d'abord ; `query` filtre sur l'identifiant ou l'e-mail (côté serveur). */
  users(filter: AdminUserFilter, page: number, size: number): Observable<AdminUserPage> {
    let params = new HttpParams().set('page', page).set('size', size).set('sort', 'createdDate,desc');
    if (filter.query.trim()) params = params.set('q', filter.query.trim());
    if (filter.role) params = params.set('role', filter.role);
    if (filter.activated !== null) params = params.set('activated', filter.activated);
    if (filter.excludeTest) params = params.set('excludeTest', true);
    return this.http
      .get<AdminUser[]>('/api/admin/users', { params, observe: 'response' })
      .pipe(
        map((response) => ({
          items: response.body ?? [],
          total: Number(response.headers.get('X-Total-Count') ?? response.body?.length ?? 0),
        })),
      );
  }

  /** Remplace le compte (le serveur attend l'objet complet) : activation et rôles sont les seuls champs que l'interface modifie. */
  updateUser(user: AdminUser, change: { activated?: boolean; authorities?: string[] }): Observable<AdminUser> {
    return this.http.put<AdminUser>('/api/admin/users', { ...user, ...change });
  }

  /** Une page de contributeurs avec leur période d'essai, les plus récents d'abord ; `status` filtre côté serveur. */
  contributors(
    status: AdminContributorStatus | '',
    page: number,
    size: number,
  ): Observable<{ items: AdminContributor[]; total: number }> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    return this.http
      .get<AdminContributor[]>('/api/admin/contributors', { params, observe: 'response' })
      .pipe(
        map((response) => ({
          items: response.body ?? [],
          total: Number(response.headers.get('X-Total-Count') ?? response.body?.length ?? 0),
        })),
      );
  }

  /** Cherche à quel achat correspond un fichier d'une copie suspecte (WAV, manifest.tsv ou liste de noms). */
  leakCheck(file: File): Observable<LeakReport> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<LeakReport>('/api/admin/leak-check', form);
  }

  setContributorStatus(id: number, status: AdminContributorStatus): Observable<unknown> {
    return this.http.post(`/api/admin/contributors/${id}/status`, null, { params: { value: status } });
  }
}

export interface LeakMatch {
  purchaseId: number;
  datasetSlug: string;
  versionLabel: string;
  buyer: string;
  purchasedAt: string;
  /** Concordance entre 0 et 1. */
  score: number;
}

export interface LeakReport {
  kind: 'AUDIO' | 'NAMES';
  /** AUDIO : achats comparés ; NAMES : noms de fichiers reconnus dans le fichier. */
  inspected: number;
  matches: LeakMatch[];
}

export type AdminContributorStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED';

export interface AdminContributor {
  id: number;
  displayName: string;
  login: string | null;
  status: AdminContributorStatus;
  createdAt: string;
  used: number;
  pending: number;
  validated: number;
  rejected: number;
}

export interface AdminUser {
  id: number;
  login: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  imageUrl: string | null;
  activated: boolean;
  langKey: string | null;
  createdDate: string | null;
  authorities: string[];
}

/** Critères cumulables de la liste ; `role` vide et `activated` nul = pas de filtre. */
export interface AdminUserFilter {
  query: string;
  role: string;
  activated: boolean | null;
  /** Masque les comptes créés par les scripts d'import (préfixe `imp_`). */
  excludeTest: boolean;
}

export interface AdminUserPage {
  items: AdminUser[];
  total: number;
}

export type ScriptKind = 'LATIN' | 'ARABIC' | 'NKO' | 'OTHER';
export type TextDirection = 'LTR' | 'RTL';
export type LanguageStatus = 'WAITLIST' | 'ACTIVE';

/** Une langue avec sa progression vers le seuil d'activation (calculée par le serveur). */
export interface AdminLanguageOverview {
  id: number;
  code: string;
  name: string;
  dialect: string | null;
  script: ScriptKind;
  direction: TextDirection;
  status: LanguageStatus;
  minValidators: number;
  qualifiedValidators: number;
  pendingValidators: number;
  recordingsSubmitted: number;
  recordingsValidated: number;
}

export interface NewLanguage {
  code: string;
  name: string;
  dialect: string;
  script: ScriptKind;
  direction: TextDirection;
  minValidators: number;
}

export type DatasetPlanKind = 'STARTER' | 'PLUS' | 'PRO';
export type LicenseKindValue = 'PROTOTYPE' | 'RESEARCH' | 'COMMERCIAL';

export interface AdminDataset {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  domain: string | null;
  plan: DatasetPlanKind;
  language: AdminLanguage | null;
}

export type VersionStatusKind = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';

export interface AdminVersionRow {
  id: number;
  label: string;
  license: LicenseKindValue;
  status: VersionStatusKind;
  hours: number | null;
  speakers: number | null;
  /** Enregistrements figés dans la version. */
  recordings: number;
  pricePerHourFcfa: number | null;
  purchases: number;
  createdAt: string | null;
}

export interface AdminDatasetRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  domain: string | null;
  plan: DatasetPlanKind;
  languageId: number | null;
  languageName: string | null;
  versions: AdminVersionRow[];
}

export interface AdminDatasetFilter {
  query: string;
  languageId: number | null;
  plan: DatasetPlanKind | '';
  domain: string;
  /** Vrai = au moins une version publiée ; faux = aucune ; nul = pas de filtre. */
  published: boolean | null;
}

export interface AdminDatasetPage {
  items: AdminDatasetRow[];
  total: number;
}

export interface NewDataset {
  slug: string;
  title: string;
  description: string;
  domain: string;
  plan: DatasetPlanKind;
  languageId: number;
}

export interface NewVersion {
  label: string;
  license: LicenseKindValue;
  pricePerHourFcfa: number | null;
  /** Taille maximale de la version (échantillon) ; `null` = tous les enregistrements éligibles. */
  maxRecordings: number | null;
}

export interface PublishedVersion {
  id: number;
  label: string;
  hours: number;
  speakers: number;
  sha256: string;
}
