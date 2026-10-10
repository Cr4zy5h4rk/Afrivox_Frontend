import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import {
  CatalogService,
  LanguageView,
  MlTask,
  ModelSummary,
  PageView,
} from '../../core/api/catalog.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';
import { ModelCard } from '../../core/ui/model-card';
import { Pager } from '../../core/ui/pager';

interface Filters {
  q: string;
  task: string;
  language: string;
  page: number;
}

const PAGE_SIZE = 12;

/** Model Hub : liste publique des modèles, avec recherche et filtres (tâche, langue). */
@Component({
  selector: 'app-models',
  imports: [MatButtonModule, RouterLink, ModelCard, Pager],
  templateUrl: './models.html',
  styleUrl: './models.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsPage {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);

  protected readonly filters = signal<Filters>({ q: '', task: '', language: '', page: 0 });
  protected readonly result = signal<PageView<ModelSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly tasks: MlTask[] = ['ASR', 'TTS', 'INTENT', 'CONVERSATION', 'OTHER'];

  constructor() {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });

    toObservable(this.filters)
      .pipe(
        debounceTime(300),
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap((f) =>
          this.catalog
            .models({ q: f.q, task: f.task, language: f.language, page: f.page, size: PAGE_SIZE })
            .pipe(
              map((page) => ({ page })),
              catchError(() => of({ page: null })),
            ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(({ page }) => {
        this.loading.set(false);
        this.failed.set(page === null);
        if (page) this.result.set(page);
      });
  }

  /** Seuls développeurs et admin publient ; les autres sont invités à se connecter. */
  protected canPublish(): boolean {
    return this.auth.hasRole('ROLE_DEVELOPER') || this.auth.hasRole('ROLE_ADMIN');
  }

  protected taskKey(task: MlTask): TranslationKey {
    return `task.${task}`;
  }

  protected setQuery(event: Event): void {
    this.update({ q: (event.target as HTMLInputElement).value, page: 0 });
  }

  protected setTask(event: Event): void {
    this.update({ task: (event.target as HTMLSelectElement).value, page: 0 });
  }

  protected setLanguage(event: Event): void {
    this.update({ language: (event.target as HTMLSelectElement).value, page: 0 });
  }

  protected setPage(page: number): void {
    this.update({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected retry(): void {
    this.filters.update((f) => ({ ...f }));
  }

  private update(change: Partial<Filters>): void {
    this.filters.update((f) => ({ ...f, ...change }));
  }
}
