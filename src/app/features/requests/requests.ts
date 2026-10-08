import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RequestStatus } from '../../core/api/admin.service';
import { CatalogService, LanguageView } from '../../core/api/catalog.service';
import {
  MyRequest,
  OrganizationService,
  SECTORS,
  Sector,
  UsageKind,
} from '../../core/api/organization.service';
import { ApiError, toApiError } from '../../core/api-error';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Espace organisation : déposer une demande de dataset sur mesure et suivre son statut. */
@Component({
  selector: 'app-requests',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './requests.html',
  styleUrl: './requests.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly organization = inject(OrganizationService);
  private readonly catalog = inject(CatalogService);

  protected readonly sectors = SECTORS;
  protected readonly usages: UsageKind[] = ['COMMERCIAL', 'RESEARCH'];
  protected readonly languages = signal<LanguageView[]>([]);
  protected readonly requests = signal<MyRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    orgName: ['', [Validators.required, Validators.maxLength(120)]],
    sector: ['BANK' as Sector, Validators.required],
    languageCode: ['', Validators.required],
    hours: [null as number | null, [Validators.required, Validators.min(1), Validators.max(100000)]],
    speakersTarget: [null as number | null, [Validators.min(1), Validators.max(1000000)]],
    conversationType: ['', Validators.maxLength(120)],
    usageKind: ['COMMERCIAL' as UsageKind, Validators.required],
    deadline: [''],
    description: ['', Validators.maxLength(1500)],
  });

  ngOnInit(): void {
    this.catalog.languages().subscribe({ next: (l) => this.languages.set(l), error: () => undefined });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.organization.mine().subscribe({
      next: (list) => {
        this.requests.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected sectorKey(sector: Sector): TranslationKey {
    return `sector.${sector}`;
  }

  protected usageKey(usage: UsageKind): TranslationKey {
    return `orgreq.usage.${usage}`;
  }

  protected statusKey(status: RequestStatus): TranslationKey {
    return `reqstatus.${status}`;
  }

  protected submit(): void {
    if (this.form.invalid || this.sending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.sending.set(true);
    this.sent.set(false);
    this.error.set(null);
    this.organization
      .submit({
        orgName: value.orgName,
        sector: value.sector,
        languageCode: value.languageCode,
        hours: value.hours as number,
        speakersTarget: value.speakersTarget,
        conversationType: value.conversationType || null,
        usageKind: value.usageKind,
        deadline: value.deadline || null,
        description: value.description || null,
      })
      .subscribe({
        next: (created) => {
          this.requests.update((list) => [created, ...list]);
          // On garde le nom d'organisation pour une éventuelle demande suivante
          this.form.reset({ orgName: value.orgName, sector: value.sector, usageKind: 'COMMERCIAL' });
          this.sent.set(true);
          this.sending.set(false);
        },
        error: (err: unknown) => {
          this.error.set(toApiError(err));
          this.sending.set(false);
        },
      });
  }
}
