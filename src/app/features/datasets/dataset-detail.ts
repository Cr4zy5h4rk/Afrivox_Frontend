import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import { CatalogService, DatasetDetail, LicenseKind } from '../../core/api/catalog.service';
import { PurchaseService, Quote } from '../../core/api/purchase.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

const LICENSES: LicenseKind[] = ['PROTOTYPE', 'RESEARCH', 'COMMERCIAL'];

/** Fiche d'un dataset : versions publiées, détails, et parcours d'achat (licence, acceptation, paiement simulé). */
@Component({
  selector: 'app-dataset-detail',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './dataset-detail.html',
  styleUrl: './dataset-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetDetailPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly purchases = inject(PurchaseService);
  private readonly router = inject(Router);

  /** Paramètre de route `:slug` (withComponentInputBinding). */
  readonly slug = input.required<string>();

  protected readonly detail = signal<DatasetDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'notfound' | 'failed'>('loading');

  protected readonly licenses = LICENSES;
  /** Version choisie pour l'achat (null = panneau fermé). */
  protected readonly selected = signal<string | null>(null);
  protected readonly license = signal<LicenseKind>('RESEARCH');
  protected readonly quote = signal<Quote | null>(null);
  protected readonly quoteFailed = signal(false);
  protected readonly readTerms = signal(false);
  protected readonly agreeUsage = signal(false);
  protected readonly buying = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly canBuy = computed(
    () =>
      this.quote() !== null &&
      this.readTerms() &&
      this.agreeUsage() &&
      !this.buying(),
  );

  /** Pourquoi l'achat n'est pas proposé (null = il l'est). Le serveur refait ces contrôles. */
  /** Les développeurs (et l'admin) peuvent publier un modèle entraîné sur ce dataset. */
  protected canPublishModel(): boolean {
    return this.auth.hasRole('ROLE_DEVELOPER') || this.auth.hasRole('ROLE_ADMIN');
  }

  protected buyHint(): TranslationKey | null {
    if (!this.auth.isAuthenticated()) return 'dataset.download.signin';
    const allowed =
      this.auth.hasRole('ROLE_ADMIN') ||
      this.auth.hasRole('ROLE_DEVELOPER') ||
      this.auth.hasRole('ROLE_ORGANIZATION');
    return allowed ? null : 'dataset.download.role';
  }

  /** Ouvre le panneau d'achat pour une version et charge le prix. */
  protected choose(label: string): void {
    this.selected.set(label);
    this.readTerms.set(false);
    this.agreeUsage.set(false);
    this.error.set(null);
    this.loadQuote();
  }

  protected close(): void {
    this.selected.set(null);
    this.quote.set(null);
  }

  protected setLicense(license: LicenseKind): void {
    this.license.set(license);
    this.loadQuote();
  }

  private loadQuote(): void {
    const label = this.selected();
    if (!label) return;
    const license = this.license();
    this.quote.set(null);
    this.quoteFailed.set(false);
    this.purchases.quote(this.slug(), label, license).subscribe({
      next: (q) => {
        // Ignore une réponse arrivée après un changement de version ou de licence.
        if (this.selected() === label && this.license() === license) this.quote.set(q);
      },
      error: () => this.quoteFailed.set(true),
    });
  }

  /** Crée l'achat (le paiement est simulé côté serveur) puis ouvre « Mes achats ». */
  protected buy(): void {
    const label = this.selected();
    if (!label || !this.canBuy()) return;
    this.buying.set(true);
    this.error.set(null);
    this.purchases.purchase(this.slug(), label, this.license(), true).subscribe({
      next: () => {
        this.buying.set(false);
        void this.router.navigateByUrl('/purchases');
      },
      error: (err: unknown) => {
        this.buying.set(false);
        this.error.set(toApiError(err));
      },
    });
  }

  ngOnInit(): void {
    this.catalog.dataset(this.slug()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.state.set('ready');
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'failed'),
    });
  }

  protected licenseKey(license: string): TranslationKey {
    return `license.${license}` as TranslationKey;
  }

  protected licenseTextKey(license: string): TranslationKey {
    return `license.text.${license}` as TranslationKey;
  }

  protected planKey(plan: string): TranslationKey {
    return `plan.${plan}` as TranslationKey;
  }
}
