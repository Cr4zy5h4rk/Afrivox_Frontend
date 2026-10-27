import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ModelCommentPage, ModelCommentView, ModelSummary, PageView } from './catalog.service';

/** Un projet publié dans le hub des développeurs. */
export interface ProjectView {
  id: number;
  title: string;
  summary: string;
  repoUrl: string | null;
  demoUrl: string | null;
  languageCode: string | null;
  languageName: string | null;
  tags: string[];
  modelId: number | null;
  modelName: string | null;
  ownerId: number;
  ownerName: string;
  /** Le profil de l'auteur est public : on peut afficher le lien vers sa page. */
  ownerPublic: boolean;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  canDelete: boolean;
}

export interface ProjectInput {
  title: string;
  summary: string;
  repoUrl: string;
  demoUrl: string;
  languageCode: string;
  tags: string[];
  modelId: number | null;
}

export interface DeveloperSummary {
  id: number;
  name: string;
  bio: string | null;
  openToWork: boolean;
  models: number;
  projects: number;
}

export interface DeveloperProfile {
  id: number;
  name: string;
  bio: string | null;
  profileUrl: string | null;
  openToWork: boolean;
  models: ModelSummary[];
  projects: ProjectView[];
}

/** Réglages de visibilité du développeur connecté. */
export interface DeveloperSettings {
  /** Identifiant du profil (lecture seule : sert au lien vers la page publique). */
  id?: number;
  displayName: string;
  bio: string | null;
  profileUrl: string | null;
  publicProfile: boolean;
  openToWork: boolean;
}

export type ContactStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface ContactReceived {
  id: number;
  senderName: string;
  message: string;
  contact: string;
  status: ContactStatus;
  createdAt: string;
  answeredAt: string | null;
}

export interface ContactSent {
  id: number;
  recipientId: number;
  recipientName: string;
  message: string;
  status: ContactStatus;
  createdAt: string;
  answeredAt: string | null;
}

/** Hub des développeurs : projets, annuaire, profil public et prises de contact. */
@Injectable({ providedIn: 'root' })
export class HubService {
  private readonly http = inject(HttpClient);

  // ---- Projets ----

  projects(filters: { q?: string; language?: string; tag?: string; page?: number; size?: number }): Observable<PageView<ProjectView>> {
    return this.http.get<PageView<ProjectView>>('/api/public/projects', { params: toParams(filters) });
  }

  project(id: number): Observable<ProjectView> {
    return this.http.get<ProjectView>(`/api/public/projects/${id}`);
  }

  myProjects(): Observable<ProjectView[]> {
    return this.http.get<ProjectView[]>('/api/me/projects');
  }

  createProject(input: ProjectInput): Observable<ProjectView> {
    return this.http.post<ProjectView>('/api/me/projects', input);
  }

  updateProject(id: number, input: ProjectInput): Observable<ProjectView> {
    return this.http.put<ProjectView>(`/api/me/projects/${id}`, input);
  }

  /** Mes modèles, pour en lier un à un projet. */
  myModels(): Observable<ModelSummary[]> {
    return this.http.get<ModelSummary[]>('/api/me/models');
  }

  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`/api/me/projects/${id}`);
  }

  projectComments(projectId: number, page = 0, size = 20): Observable<ModelCommentPage> {
    return this.http.get<ModelCommentPage>(`/api/public/projects/${projectId}/comments`, {
      params: toParams({ page, size }),
    });
  }

  addProjectComment(projectId: number, body: string, parentId: number | null = null): Observable<ModelCommentView> {
    return this.http.post<ModelCommentView>(`/api/community/projects/${projectId}/comments`, { body, parentId });
  }

  // ---- Développeurs ----

  developers(filters: { q?: string; openToWork?: boolean; page?: number; size?: number }): Observable<PageView<DeveloperSummary>> {
    return this.http.get<PageView<DeveloperSummary>>('/api/public/developers', {
      params: toParams({ ...filters, openToWork: filters.openToWork ? 'true' : undefined }),
    });
  }

  developer(id: number): Observable<DeveloperProfile> {
    return this.http.get<DeveloperProfile>(`/api/public/developers/${id}`);
  }

  settings(): Observable<DeveloperSettings> {
    return this.http.get<DeveloperSettings>('/api/me/developer-profile');
  }

  saveSettings(settings: DeveloperSettings): Observable<DeveloperSettings> {
    return this.http.put<DeveloperSettings>('/api/me/developer-profile', settings);
  }

  // ---- Contact ----

  contact(developerId: number, message: string, contact: string): Observable<ContactSent> {
    return this.http.post<ContactSent>(`/api/community/developers/${developerId}/contact`, { message, contact });
  }

  received(): Observable<ContactReceived[]> {
    return this.http.get<ContactReceived[]>('/api/community/contact-requests/received');
  }

  sent(): Observable<ContactSent[]> {
    return this.http.get<ContactSent[]>('/api/community/contact-requests/sent');
  }

  answer(id: number, accept: boolean): Observable<void> {
    return this.http.post<void>(`/api/community/contact-requests/${id}/${accept ? 'accept' : 'decline'}`, {});
  }
}

/** Ne garde que les filtres renseignés (pas de `?q=&tag=` vides dans l'URL). */
function toParams(values: Record<string, string | number | boolean | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}
