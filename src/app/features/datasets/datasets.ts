import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import {
  CatalogService,
  DatasetPlan,
  DatasetSummary,
  LanguageView,
  PageView,
} from '../../core/api/catalog.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';
import { DatasetCard } from '../../core/ui/dataset-card';
import { Pager } from '../../core/ui/pager';

interface Filters {
  q: string;
  language: string;
  plan: string;
  page: number;
}

const PAGE_SIZE = 12;

/** Catalogue public de datasets : recherche, filtres (langue, offre), pagination. */
@Component({
  selector: 'app-datasets',
  imports: [MatButtonModule, RouterLink, DatasetCard, Pager],
  templateUrl: './datasets.html',
  styleUrl: './datasets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetsPage {
  protected readonly i18n = inject(I18nService);
  private readonly catalog = inject(CatalogService);

  protected readonly filters = signal<Filters>({ q: '', language: '', plan: '', page: 0 });
  protected readonly result = signal<PageView<DatasetSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly plans = ['STARTER', 'PLUS', 'PRO'] as const;

  constructor() {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });

    // Une recherche est lancée 300 ms après la dernière saisie ; une nouvelle annule la précédente (switchMap)
    toObservable(this.filters)
      .pipe(
        debounceTime(300),
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap((f) =>
          this.catalog
            .datasets({ q: f.q, language: f.language, plan: f.plan, page: f.page, size: PAGE_SIZE })
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

  protected planKey(plan: DatasetPlan): TranslationKey {
    return `plan.${plan}`;
  }

  protected setQuery(event: Event): void {
    this.update({ q: (event.target as HTMLInputElement).value, page: 0 });
  }

  protected setLanguage(event: Event): void {
    this.update({ language: (event.target as HTMLSelectElement).value, page: 0 });
  }

  protected setPlan(event: Event): void {
    this.update({ plan: (event.target as HTMLSelectElement).value, page: 0 });
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
