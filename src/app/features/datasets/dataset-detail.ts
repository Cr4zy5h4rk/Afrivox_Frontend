import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import {
  CatalogService,
  DatasetDetail,
  DatasetTechnical,
  DurationBucket,
  LicenseKind,
  PreviewRow,
} from '../../core/api/catalog.service';
import { PurchaseService, Quote } from '../../core/api/purchase.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

const LICENSES: LicenseKind[] = ['PROTOTYPE', 'RESEARCH', 'COMMERCIAL'];

type Tab = 'card' | 'stats' | 'viewer' | 'files' | 'models';

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

  // ---- Vue technique (onglets façon Hugging Face) ----
  protected readonly tab = signal<Tab>('card');
  /** Version dont on regarde les chiffres ; `null` = la plus récente. */
  protected readonly techVersion = signal<string | null>(null);
  protected readonly tech = signal<DatasetTechnical | null>(null);
  protected readonly techState = signal<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  protected readonly preview = signal<PreviewRow[] | null>(null);
  protected readonly previewState = signal<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  protected readonly copied = signal(false);

  // ---- Clips audio de l'échantillon (interrupteur du dataset) ----
  /** URL d'objet du clip déjà chargé, par identifiant de ligne. */
  protected readonly clips = signal<Record<number, string>>({});
  protected readonly clipLoading = signal<number | null>(null);
  protected readonly clipFailed = signal<number | null>(null);
  protected readonly hasAudio = computed(() => (this.preview() ?? []).some((r) => r.audio));
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Les URL d'objet gardent le clip en mémoire : on les libère à la fermeture de la page.
    this.destroyRef.onDestroy(() => this.releaseClips());
  }

  /** Hauteur relative des barres de l'histogramme (la tranche la plus fournie vaut 100 %). */
  protected readonly histogramMax = computed(() =>
    Math.max(1, ...(this.tech()?.stats.durationHistogram ?? []).map((b) => b.count)),
  );

  /** Catégorie de taille, comme les étiquettes « size_categories » de Hugging Face. */
  protected readonly sizeCategory = computed(() => {
    const hours = this.tech()?.stats.hours ?? this.detail()?.dataset.latestVersion?.hours ?? null;
    if (hours === null) return null;
    return hours < 1 ? '< 1 h' : hours < 10 ? '1–10 h' : hours < 100 ? '10–100 h' : '> 100 h';
  });

  /** Extrait de chargement : il décrit l'archive réelle (colonnes du manifeste, découpages par fichier). */
  protected readonly snippet = computed(() => {
    const t = this.tech();
    if (!t) return '';
    return [
      'import zipfile, pandas as pd',
      '',
      `with zipfile.ZipFile("${t.slug}-${t.version}.zip") as z:`,
      '    z.extractall("data")',
      '',
      'train = pd.read_csv("data/splits/train.tsv", sep="\\t")',
      'dev = pd.read_csv("data/splits/dev.tsv", sep="\\t")',
      'test = pd.read_csv("data/splits/test.tsv", sep="\\t")',
      '',
      `# colonnes : ${t.columns.join(", ")}`,
      '# audio : data/<colonne "file">',
      'print(train.head())',
    ].join('\n');
  });

  protected readonly tabs: { id: Tab; label: TranslationKey }[] = [
    { id: 'card', label: 'dsx.tab.card' },
    { id: 'stats', label: 'dsx.tab.stats' },
    { id: 'viewer', label: 'dsx.tab.viewer' },
    { id: 'files', label: 'dsx.tab.files' },
    { id: 'models', label: 'dsx.tab.models' },
  ];

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'viewer') this.loadPreview();
  }

  protected setTechVersion(label: string): void {
    this.techVersion.set(label);
    this.preview.set(null);
    this.previewState.set('idle');
    this.releaseClips();
    this.loadTechnical();
    if (this.tab() === 'viewer') this.loadPreview();
  }

  private loadTechnical(): void {
    this.techState.set('loading');
    this.catalog.technical(this.slug(), this.techVersion() ?? undefined).subscribe({
      next: (t) => {
        this.tech.set(t);
        if (this.techVersion() === null) this.techVersion.set(t.version);
        this.techState.set('ready');
      },
      // 404 : pas de version publiée, ou archive absente du serveur
      error: () => this.techState.set('unavailable'),
    });
  }

  private loadPreview(): void {
    if (!this.auth.isAuthenticated() || this.previewState() === 'loading' || this.preview() !== null) return;
    this.previewState.set('loading');
    this.catalog.preview(this.slug(), this.techVersion() ?? undefined).subscribe({
      next: (rows) => {
        this.preview.set(rows);
        this.previewState.set('ready');
      },
      error: () => this.previewState.set('failed'),
    });
  }

  /** Charge le clip d'une ligne de l'échantillon (une seule fois) ; le lecteur apparaît quand il est prêt. */
  protected listen(row: PreviewRow): void {
    if (this.clips()[row.id] || this.clipLoading() !== null) return;
    this.clipLoading.set(row.id);
    this.clipFailed.set(null);
    this.catalog.previewAudio(this.slug(), row.id, this.techVersion() ?? undefined).subscribe({
      next: (blob) => {
        this.clips.update((current) => ({ ...current, [row.id]: URL.createObjectURL(blob) }));
        this.clipLoading.set(null);
      },
      error: () => {
        this.clipFailed.set(row.id);
        this.clipLoading.set(null);
      },
    });
  }

  private releaseClips(): void {
    Object.values(this.clips()).forEach((url) => URL.revokeObjectURL(url));
    this.clips.set({});
    this.clipLoading.set(null);
    this.clipFailed.set(null);
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // presse-papiers indisponible (contexte non sécurisé) : l'utilisateur sélectionne le texte à la main
    }
  }

  protected barHeight(bucket: DurationBucket): number {
    return Math.round((bucket.count / this.histogramMax()) * 100);
  }

  protected bucketLabel(bucket: DurationBucket): string {
    return bucket.toSec === null ? `${bucket.fromSec}+` : `${bucket.fromSec}–${bucket.toSec}`;
  }

  /** Taille lisible (octets → Ko, Mo, Go), sur 1 décimale. */
  protected bytes(value: number): string {
    const units = ['o', 'Ko', 'Mo', 'Go'];
    let v = value;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${this.i18n.n(v, i === 0 ? 0 : 1)} ${units[i]}`;
  }

  protected percent(part: number, total: number): string {
    return total > 0 ? `${this.i18n.n((part / total) * 100, 0)} %` : this.i18n.t('common.none');
  }

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
        // Sans version publiée, il n'y a pas d'archive à analyser : les onglets techniques restent vides
        if (detail.versions.length > 0) this.loadTechnical();
        else this.techState.set('unavailable');
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
