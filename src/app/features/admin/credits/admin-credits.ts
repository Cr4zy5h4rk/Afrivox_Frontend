import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { toApiError } from '../../../core/api-error';
import {
  CREDIT_RATE_KINDS,
  CreditRate,
  CreditRateChange,
  CreditRateKind,
  CreditService,
  MAX_CREDIT_RATE,
} from '../../../core/api/credit.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

const HISTORY_PAGE_SIZE = 10;

interface Notice {
  text: TranslationKey;
  ok: boolean;
}

/**
 * Crédits : tarifs globaux (ce que rapporte un enregistrement validé, un avis concordant, une tâche piège réussie),
 * journal de leurs changements et ajustement manuel d'un solde. Les tarifs propres à une campagne se règlent dans la
 * fiche de la campagne ; ils priment sur ceux d'ici.
 */
@Component({
  selector: 'app-admin-credits',
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './admin-credits.html',
  styleUrl: './admin-credits.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCreditsSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly credits = inject(CreditService);

  protected readonly kinds = CREDIT_RATE_KINDS;
  protected readonly maxRate = MAX_CREDIT_RATE;
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly busy = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly rates = signal<CreditRate[]>([]);
  protected readonly history = signal<CreditRateChange[]>([]);
  protected readonly historyTotal = signal(0);
  protected readonly historyPage = signal(0);
  protected readonly historyPages = computed(() => Math.max(1, Math.ceil(this.historyTotal() / HISTORY_PAGE_SIZE)));

  protected readonly rateForm = inject(FormBuilder).nonNullable.group({
    VALIDATED_RECORDING: [0, [Validators.required, Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
    REVIEW_AGREED: [0, [Validators.required, Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
    TRAP_CORRECT: [0, [Validators.required, Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
  });

  protected readonly adjustForm = inject(FormBuilder).nonNullable.group({
    login: ['', [Validators.required, Validators.maxLength(50)]],
    amount: [null as number | null, [Validators.required]],
    note: ['', [Validators.required, Validators.maxLength(140)]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.credits.rates().subscribe({
      next: (rates) => {
        this.applyRates(rates);
        this.loadHistory(0);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected rateLabel(kind: CreditRateKind): TranslationKey {
    return `admincredits.kind.${kind}` as TranslationKey;
  }

  protected saveRates(): void {
    if (this.rateForm.invalid || this.busy()) {
      this.rateForm.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
    this.credits.updateRates(this.rateForm.getRawValue()).subscribe({
      next: (rates) => {
        this.applyRates(rates);
        this.loadHistory(0);
        this.notice.set({ text: 'admincredits.saved', ok: true });
        this.busy.set(false);
      },
      error: (err) => this.fail(err),
    });
  }

  protected adjust(): void {
    if (this.adjustForm.invalid || this.busy()) {
      this.adjustForm.markAllAsTouched();
      return;
    }
    const { login, amount, note } = this.adjustForm.getRawValue();
    this.busy.set(true);
    this.notice.set(null);
    this.credits.adjust(login.trim(), amount as number, note.trim()).subscribe({
      next: () => {
        this.adjustForm.reset({ login: '', amount: null, note: '' });
        this.notice.set({ text: 'admincredits.adjusted', ok: true });
        this.busy.set(false);
      },
      error: (err) => this.fail(err),
    });
  }

  protected goToHistory(page: number): void {
    if (page < 0 || page >= this.historyPages()) return;
    this.loadHistory(page);
  }

  /** `GLOBAL` ou `CAMPAIGN:12` : la campagne est désignée par son numéro. */
  protected scopeLabel(scope: string): string {
    return scope.startsWith('CAMPAIGN:')
      ? this.i18n.t('admincredits.scope.campaign', { id: scope.slice('CAMPAIGN:'.length) })
      : this.i18n.t('admincredits.scope.global');
  }

  private applyRates(rates: CreditRate[]): void {
    this.rates.set(rates);
    const value = {} as Record<CreditRateKind, number>;
    for (const rate of rates) value[rate.kind] = rate.amount;
    this.rateForm.reset(value);
  }

  private loadHistory(page: number): void {
    this.credits.rateHistory(page, HISTORY_PAGE_SIZE).subscribe({
      next: ({ items, total }) => {
        this.history.set(items);
        this.historyTotal.set(total);
        this.historyPage.set(page);
      },
      error: () => this.notice.set({ text: 'common.error', ok: false }),
    });
  }

  private fail(err: unknown): void {
    this.notice.set({ text: toApiError(err).key, ok: false });
    this.busy.set(false);
  }
}
