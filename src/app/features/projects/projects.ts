import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { CatalogService, LanguageView, PageView } from '../../core/api/catalog.service';
import { HubService, ProjectView } from '../../core/api/hub.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Avatar } from '../../core/ui/avatar';
import { Pager } from '../../core/ui/pager';

interface Filters {
  q: string;
  language: string;
  tag: string;
  page: number;
}

const PAGE_SIZE = 12;

/** Hub des développeurs : liste publique des projets, avec recherche, langue et étiquette. */
@Component({
  selector: 'app-projects',
  imports: [MatButtonModule, RouterLink, Pager, Avatar],
  templateUrl: './projects.html',
  styleUrl: './projects.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPage {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly hub = inject(HubService);
  private readonly catalog = inject(CatalogService);

  protected readonly filters = signal<Filters>({ q: '', language: '', tag: '', page: 0 });
  protected readonly result = signal<PageView<ProjectView> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly languages = signal<LanguageView[]>([]);

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
          this.hub.projects({ q: f.q, language: f.language, tag: f.tag, page: f.page, size: PAGE_SIZE }).pipe(
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

  protected setQuery(event: Event): void {
    this.update({ q: (event.target as HTMLInputElement).value, page: 0 });
  }

  protected setTag(event: Event): void {
    this.update({ tag: (event.target as HTMLInputElement).value.trim().toLowerCase(), page: 0 });
  }

  protected setLanguage(event: Event): void {
    this.update({ language: (event.target as HTMLSelectElement).value, page: 0 });
  }

  /** Un clic sur une étiquette d'une carte filtre la liste dessus. */
  protected pickTag(tag: string): void {
    this.update({ tag, page: 0 });
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
