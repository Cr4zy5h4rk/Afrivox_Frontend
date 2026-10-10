import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, forkJoin } from 'rxjs';
import {
  AdminDatasetRow,
  AdminLanguage,
  AdminVersionRow,
  VersionStatusKind,
  AdminService,
  DatasetPlanKind,
  LicenseKindValue,
} from '../../../core/api/admin.service';
import { toApiError } from '../../../core/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

interface Notice {
  text: TranslationKey;
  params?: Record<string, string | number>;
  ok: boolean;
}

/**
 * Datasets : création d'un dataset (fiche du catalogue) et publication de ses versions. Publier fige les
 * enregistrements validés et consentis de la langue dans une archive téléchargeable, qui ne change plus ensuite.
 */
@Component({
  selector: 'app-admin-datasets',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './admin-datasets.html',
  styleUrl: './admin-datasets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDatasetsSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly admin = inject(AdminService);

  protected readonly datasets = signal<AdminDatasetRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly domains = signal<string[]>([]);
  // Filtres cumulables, appliqués côté serveur
  protected readonly query = signal('');
  protected readonly languageFilter = signal<number | null>(null);
  protected readonly planFilter = signal<DatasetPlanKind | ''>('');
  protected readonly domainFilter = signal('');
  protected readonly publishedFilter = signal<'all' | 'yes' | 'no'>('all');
  /** Dataset dont le formulaire de modification est ouvert. */
  protected readonly editingFor = signal<number | null>(null);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly languages = signal<AdminLanguage[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly showForm = signal(false);
  /** Dataset dont le formulaire de publication est ouvert. */
  protected readonly publishingFor = signal<number | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly plans: DatasetPlanKind[] = ['STARTER', 'PLUS', 'PRO'];
  protected readonly licenses: LicenseKindValue[] = ['PROTOTYPE', 'RESEARCH', 'COMMERCIAL'];

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    slug: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/)]],
    description: ['', Validators.maxLength(1000)],
    domain: ['', Validators.maxLength(80)],
    plan: ['STARTER' as DatasetPlanKind, Validators.required],
    languageId: [null as number | null, Validators.required],
  });

  protected readonly versionForm = this.fb.group({
    label: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/)]],
    license: ['RESEARCH' as LicenseKindValue, Validators.required],
    pricePerHourFcfa: [null as number | null, Validators.min(0)],
    maxRecordings: [null as number | null, Validators.min(1)],
  });

  protected readonly editForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', Validators.maxLength(1000)],
    domain: ['', Validators.maxLength(80)],
    plan: ['STARTER' as DatasetPlanKind, Validators.required],
  });

  ngOnInit(): void {
    // Pas de requête de recherche qui part après la fermeture de l'onglet
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
    this.loadDomains();
    this.load();
  }

  private loadDomains(): void {
    this.admin.datasetDomains().subscribe({ next: (d) => this.domains.set(d), error: () => undefined });
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    const published = this.publishedFilter();
    const filter = {
      query: this.query(),
      languageId: this.languageFilter(),
      plan: this.planFilter(),
      domain: this.domainFilter(),
      published: published === 'all' ? null : published === 'yes',
    };
    forkJoin({
      datasets: this.admin.datasetOverview(filter, this.page(), PAGE_SIZE),
      languages: this.admin.languages(),
    }).subscribe({
      next: ({ datasets, languages }) => {
        this.datasets.set(datasets.items);
        this.total.set(datasets.total);
        this.languages.set(languages);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Recherche différée : une requête par pause de frappe. */
  protected search(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query.set(value);
      this.refilter();
    }, SEARCH_DELAY_MS);
  }

  protected setLanguageFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.languageFilter.set(value === '' ? null : Number(value));
    this.refilter();
  }

  protected setPlanFilter(event: Event): void {
    this.planFilter.set((event.target as HTMLSelectElement).value as DatasetPlanKind | '');
    this.refilter();
  }

  protected setDomainFilter(event: Event): void {
    this.domainFilter.set((event.target as HTMLSelectElement).value);
    this.refilter();
  }

  protected setPublishedFilter(event: Event): void {
    this.publishedFilter.set((event.target as HTMLSelectElement).value as 'all' | 'yes' | 'no');
    this.refilter();
  }

  /** Un filtre qui change ramène à la première page. */
  private refilter(): void {
    this.page.set(0);
    this.load();
  }

  protected goTo(page: number): void {
    if (page < 0 || page >= this.pages()) return;
    this.page.set(page);
    this.load();
  }

  protected versionStatusKey(status: VersionStatusKind): TranslationKey {
    return `adminver.status.${status}`;
  }

  protected versionTone(status: VersionStatusKind): string {
    return status === 'PUBLISHED' ? 'badge green' : status === 'WITHDRAWN' ? 'badge gray' : 'badge gold';
  }

  /** Retire ou remet en ligne une version ; retirer coupe aussi les liens de téléchargement des acheteurs. */
  protected toggleVersion(dataset: AdminDatasetRow, version: AdminVersionRow): void {
    const publishing = version.status !== 'PUBLISHED';
    if (!publishing) {
      const message = this.i18n.t('adminver.confirmWithdraw', {
        label: version.label,
        title: dataset.title,
        count: version.purchases,
      });
      if (!window.confirm(message)) return;
    }
    this.runThenReload(this.admin.setVersionStatus(version.id, publishing ? 'PUBLISHED' : 'WITHDRAWN'));
  }

  protected toggleEdit(dataset: AdminDatasetRow): void {
    if (this.editingFor() === dataset.id) {
      this.editingFor.set(null);
      return;
    }
    this.editingFor.set(dataset.id);
    this.publishingFor.set(null);
    this.notice.set(null);
    this.editForm.reset({
      title: dataset.title,
      description: dataset.description ?? '',
      domain: dataset.domain ?? '',
      plan: dataset.plan,
    });
  }

  protected saveEdit(dataset: AdminDatasetRow): void {
    if (this.editForm.invalid || this.busy()) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();
    this.runThenReload(
      this.admin.updateDataset(dataset.id, {
        title: value.title.trim(),
        description: value.description.trim() || null,
        domain: value.domain.trim() || null,
        plan: value.plan,
      }),
      () => this.editingFor.set(null),
    );
  }

  /** Écriture puis rechargement : compteurs et domaines viennent du serveur. */
  private runThenReload(call: Observable<unknown>, onSuccess?: () => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    call.subscribe({
      next: () => {
        onSuccess?.();
        this.notice.set({ text: 'admin.saved', ok: true });
        this.busy.set(false);
        this.loadDomains();
        this.load();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected planKey(plan: DatasetPlanKind): TranslationKey {
    return `plan.${plan}`;
  }

  protected licenseKey(license: LicenseKindValue): TranslationKey {
    return `license.${license}`;
  }

  protected toggleForm(): void {
    this.showForm.update((open) => !open);
    this.notice.set(null);
  }

  protected togglePublish(id: number): void {
    this.publishingFor.update((current) => (current === id ? null : id));
    this.editingFor.set(null);
    this.versionForm.reset({ license: 'RESEARCH', pricePerHourFcfa: null, maxRecordings: null });
    this.notice.set(null);
  }

  protected create(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.languageId === null) return;
    this.busy.set(true);
    this.notice.set(null);
    this.admin.createDataset({ ...value, languageId: value.languageId }).subscribe({
      next: () => {
        this.form.reset({ plan: 'STARTER', languageId: null });
        this.showForm.set(false);
        this.notice.set({ text: 'admin.saved', ok: true });
        this.busy.set(false);
        this.load();
      },
      error: (err: unknown) => this.fail(err),
    });
  }

  protected publish(dataset: AdminDatasetRow): void {
    if (this.versionForm.invalid || this.busy()) {
      this.versionForm.markAllAsTouched();
      return;
    }
    const value = this.versionForm.getRawValue();
    this.busy.set(true);
    this.notice.set(null);
    this.admin
      .publishVersion(dataset.id, {
        label: value.label.trim(),
        license: value.license,
        pricePerHourFcfa: value.pricePerHourFcfa,
        maxRecordings: value.maxRecordings,
      })
      .subscribe({
        next: (version) => {
          this.publishingFor.set(null);
          this.notice.set({
            text: 'admindata.published',
            params: {
              label: version.label,
              hours: this.i18n.n(version.hours, 2),
              speakers: this.i18n.n(version.speakers),
            },
            ok: true,
          });
          this.busy.set(false);
          this.load();
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  private fail(err: unknown): void {
    this.notice.set({ text: toApiError(err).key, ok: false });
    this.busy.set(false);
  }
}
