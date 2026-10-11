import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { CommunityService } from './core/api/community.service';
import { AuthService } from './core/auth/auth.service';
import { I18nService, LANGUAGES, Lang } from './core/i18n/i18n.service';
import { BrandMark } from './core/ui/brand-mark';

/** Coquille de l'application : en-tête (navigation, langue, compte), contenu de la page, pied de page. */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatButtonToggleModule,
    BrandMark,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Le menu du compte se ferme au clic ailleurs ou sur Échap
    '(document:click)': 'closeAccountOutside($event)',
    '(document:keydown.escape)': 'accountOpen.set(false)',
  },
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  protected readonly languages = LANGUAGES;
  protected readonly menuOpen = signal(false);
  protected readonly accountOpen = signal(false);
  protected readonly year = new Date().getFullYear();
  private readonly community = inject(CommunityService);
  /** Notifications non lues, relues à chaque changement de page (pas de temps réel dans le projet). */
  protected readonly unread = signal(0);

  constructor() {
    // Le menu mobile se referme à chaque changement de page
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.accountOpen.set(false);
        if (this.auth.isAuthenticated()) {
          this.community.unreadCount().subscribe({
            next: (r) => this.unread.set(r.unread),
            error: () => undefined,
          });
        } else {
          this.unread.set(0);
        }
      });
  }

  protected setLang(lang: Lang): void {
    this.i18n.setLang(lang);
  }

  protected toggleAccount(): void {
    this.accountOpen.update((open) => !open);
  }

  protected closeAccountOutside(event: Event): void {
    if (this.accountOpen() && !(event.target as Element | null)?.closest('.account')) {
      this.accountOpen.set(false);
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }
}
