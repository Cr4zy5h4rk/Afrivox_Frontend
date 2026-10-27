import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import { PageView } from '../../core/api/catalog.service';
import { DeveloperSummary, HubService } from '../../core/api/hub.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Pager } from '../../core/ui/pager';

interface Filters {
  q: string;
  openToWork: boolean;
  page: number;
}

const PAGE_SIZE = 12;

/** Annuaire public : seuls les développeurs qui ont rendu leur profil public y figurent. */
@Component({
  selector: 'app-developers',
  imports: [MatButtonModule, RouterLink, Pager],
  templateUrl: './developers.html',
  styleUrl: './developers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopersPage {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly hub = inject(HubService);

  protected readonly filters = signal<Filters>({ q: '', openToWork: false, page: 0 });
  protected readonly result = signal<PageView<DeveloperSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  constructor() {
    toObservable(this.filters)
      .pipe(
        debounceTime(300),
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        switchMap((f) =>
          this.hub.developers({ q: f.q, openToWork: f.openToWork, page: f.page, size: PAGE_SIZE }).pipe(
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

  /** Le profil public se règle depuis « Mon profil » (développeurs et admin). */
  protected canHaveProfile(): boolean {
    return this.auth.hasRole('ROLE_DEVELOPER') || this.auth.hasRole('ROLE_ADMIN');
  }

  protected setQuery(event: Event): void {
    this.update({ q: (event.target as HTMLInputElement).value, page: 0 });
  }

  protected setOpen(event: Event): void {
    this.update({ openToWork: (event.target as HTMLInputElement).checked, page: 0 });
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
