import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { forkJoin } from 'rxjs';
import {
  AdminDataset,
  AdminLanguage,
  AdminService,
  DatasetPlanKind,
  LicenseKindValue,
} from '../../../core/api/admin.service';
import { toApiError } from '../../../core/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

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

  protected readonly datasets = signal<AdminDataset[]>([]);
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

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    forkJoin({ datasets: this.admin.datasets(), languages: this.admin.languages() }).subscribe({
      next: ({ datasets, languages }) => {
        this.datasets.set([...datasets].sort((a, b) => a.title.localeCompare(b.title)));
        this.languages.set(languages);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
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

  protected publish(dataset: AdminDataset): void {
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
        },
        error: (err: unknown) => this.fail(err),
      });
  }

  private fail(err: unknown): void {
    this.notice.set({ text: toApiError(err).key, ok: false });
    this.busy.set(false);
  }
}
