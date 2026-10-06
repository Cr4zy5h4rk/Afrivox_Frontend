import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ContributionService } from '../api/contribution.service';

interface PendingUpload {
  id?: number;
  promptId: number;
  durationMs: number;
  mimeType: string;
  blob: Blob;
  createdAt: number;
}

const DB_NAME = 'afrivox';
const STORE = 'outbox';

/**
 * File d'envoi hors ligne : un enregistrement fait sans réseau est gardé dans IndexedDB (sur l'appareil) puis envoyé
 * au retour de la connexion. Les audios restent donc sur le téléphone jusqu'à l'envoi : ils ne sont jamais perdus
 * si l'onglet est fermé.
 */
@Injectable({ providedIn: 'root' })
export class OutboxService {
  private readonly api = inject(ContributionService);
  private flushing = false;

  /** Nombre d'enregistrements en attente d'envoi. */
  readonly pending = signal(0);

  constructor() {
    void this.refreshCount();
    window.addEventListener('online', () => void this.flush());
  }

  async add(item: Omit<PendingUpload, 'id' | 'createdAt'>): Promise<void> {
    await this.run('readwrite', (store) => store.add({ ...item, createdAt: Date.now() }));
    await this.refreshCount();
  }

  /**
   * Tente d'envoyer tout ce qui attend. S'arrête au premier échec réseau.
   * Une réponse 400 ou 409 (audio invalide ou déjà envoyé) supprime l'élément : le renvoyer ne servirait à rien.
   * Un 401 ou 403 le garde (session expirée, consentement à refaire).
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const items = await this.run<PendingUpload[]>('readonly', (store) => store.getAll());
      for (const item of items) {
        try {
          await firstValueFrom(this.api.upload(item.promptId, item.durationMs, item.blob, item.mimeType));
        } catch (error) {
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          if (status !== 400 && status !== 409) {
            break;
          }
        }
        await this.run('readwrite', (store) => store.delete(item.id as number));
      }
    } finally {
      this.flushing = false;
      await this.refreshCount();
    }
  }

  private async refreshCount(): Promise<void> {
    try {
      this.pending.set(await this.run<number>('readonly', (store) => store.count()));
    } catch {
      this.pending.set(0); // IndexedDB indisponible (navigation privée) : pas de file
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    }).finally(() => db.close());
  }
}
