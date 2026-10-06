import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import {
  CatalogService,
  DatasetSummary,
  LanguageView,
  Stats,
} from '../../core/api/catalog.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { DatasetCard } from '../../core/ui/dataset-card';

/** Page d'accueil publique : présentation, chiffres en direct, langues, datasets, appel à participer. */
@Component({
  selector: 'app-landing',
  imports: [MatButtonModule, RouterLink, DatasetCard],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);

  protected readonly stats = signal<Stats | null>(null);
  protected readonly languages = signal<LanguageView[] | null>(null);
  protected readonly datasets = signal<DatasetSummary[] | null>(null);

  /** Barres décoratives de l'illustration (aucune donnée : simple onde sonore). */
  protected readonly bars = Array.from({ length: 30 }, (_, i) => ({
    height: 18 + Math.round(Math.abs(Math.sin(i * 0.52) * Math.cos(i * 0.17)) * 78),
    delay: (i % 10) * 90,
  }));

  ngOnInit(): void {
    // Trois appels indépendants : si l'un échoue, le reste de la page s'affiche quand même
    this.catalog.stats().subscribe({ next: (s) => this.stats.set(s), error: () => this.stats.set(null) });
    this.catalog.languages().subscribe({
      next: (l) => this.languages.set(l),
      error: () => this.languages.set([]),
    });
    this.catalog.datasets({ size: 3 }).subscribe({
      next: (page) => this.datasets.set(page.items),
      error: () => this.datasets.set([]),
    });
  }
}
