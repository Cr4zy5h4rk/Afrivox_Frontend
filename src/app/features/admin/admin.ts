import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  AdminCampaign,
  AdminLanguage,
  AdminRequest,
  AdminService,
  CampaignKind,
  CampaignStatus,
  REQUEST_FLOW,
  RequestStatus,
} from '../../core/api/admin.service';
import { Observable } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

type Tab = 'requests' | 'campaigns';

/** Limites alignées sur le serveur (PromptDTO : 500 caractères) ; 200 lignes évite d'inonder l'API. */
const MAX_PROMPT_LENGTH = 500;
const MAX_PROMPTS_PER_BATCH = 200;

/**
 * Espace d'administration du MVP : suivi des demandes des organisations (statut + devis)
 * et gestion des campagnes (création, phrases, activation). Réservé à ROLE_ADMIN (garde de route
 * et règle serveur).
 */
@Component({
  selector: 'app-admin',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly admin = inject(AdminService);

  protected readonly tab = signal<Tab>('requests');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Retour d'une action (succès ou échec), annoncé aux lecteurs d'écran. */
  protected readonly notice = signal<{ text: TranslationKey; ok: boolean; count?: number } | null>(null);

  protected readonly requests = signal<AdminRequest[]>([]);
  protected readonly campaigns = signal<AdminCampaign[]>([]);
  protected readonly languages = signal<AdminLanguage[]>([]);
  /** Montants de devis en cours de saisie, par identifiant de demande. */
  protected readonly quotes = signal<Record<number, string>>({});
  /** Campagne dont le formulaire « ajouter des phrases » est ouvert. */
  protected readonly promptsFor = signal<number | null>(null);
  protected readonly busy = signal(false);

  protected readonly kinds: CampaignKind[] = ['OPEN', 'SPONSORED', 'PRIVATE'];

  protected readonly campaignForm = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', Validators.maxLength(1000)],
    domain: ['', Validators.maxLength(80)],
    kind: ['OPEN' as CampaignKind, Validators.required],
    targetSentences: [null as number | null, [Validators.min(1), Validators.max(100000)]],
    languageId: [null as number | null, Validators.required],
  });

  protected readonly promptsForm = inject(FormBuilder).nonNullable.group({
    text: ['', Validators.required],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    let pending = 3;
    const done = () => {
      if (--pending === 0) this.loading.set(false);
    };
    const fail = () => {
      this.failed.set(true);
      done();
    };
    this.admin.requests().subscribe({ next: (r) => (this.requests.set(r), done()), error: fail });
    this.admin.campaigns().subscribe({ next: (c) => (this.campaigns.set(c), done()), error: fail });
    this.admin.languages().subscribe({ next: (l) => (this.languages.set(l), done()), error: fail });
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    this.notice.set(null);
  }

  // ---------- Demandes ----------

  protected reqStatusKey(status: RequestStatus): TranslationKey {
    return `reqstatus.${status}`;
  }

  protected sectorKey(sector: string): TranslationKey {
    return `sector.${sector}` as TranslationKey;
  }

  /** Étape suivante du parcours, ou null si la demande est terminée ou refusée. */
  protected nextStatus(request: AdminRequest): RequestStatus | null {
    const index = REQUEST_FLOW.indexOf(request.status);
    return index >= 0 && index < REQUEST_FLOW.length - 1 ? REQUEST_FLOW[index + 1] : null;
  }

  protected canReject(request: AdminRequest): boolean {
    return request.status !== 'DELIVERED' && request.status !== 'REJECTED';
  }

  /** Le devis se saisit tant que la demande n'a pas été acceptée. */
  protected canQuote(request: AdminRequest): boolean {
    return request.status === 'RECEIVED' || request.status === 'IN_REVIEW' || request.status === 'QUOTED';
  }

  protected setQuote(id: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.quotes.update((q) => ({ ...q, [id]: value }));
  }

  protected quoteValue(request: AdminRequest): string {
    return this.quotes()[request.id] ?? (request.quoteAmountFcfa?.toString() ?? '');
  }

  protected advance(request: AdminRequest, status: RequestStatus): void {
    const typed = Number(this.quoteValue(request));
    const amount = Number.isFinite(typed) && typed > 0 ? Math.round(typed) : null;
    // Un devis ne part pas sans montant
    if (status === 'QUOTED' && amount === null) {
      this.notice.set({ text: 'admin.req.quoteNeeded', ok: false });
      return;
    }
    this.run(
      this.admin.updateRequest(request.id, {
        status,
        quoteAmountFcfa: this.canQuote(request) ? amount : request.quoteAmountFcfa,
      }),
      (updated) =>
        this.requests.update((list) => list.map((r) => (r.id === updated.id ? updated : r))),
    );
  }

  // ---------- Campagnes ----------

  protected campStatusKey(status: CampaignStatus): TranslationKey {
    return `campstatus.${status}`;
  }

  protected campKindKey(kind: CampaignKind): TranslationKey {
    return `campkind.${kind}`;
  }

  protected createCampaign(): void {
    if (this.campaignForm.invalid || this.busy()) {
      this.campaignForm.markAllAsTouched();
      return;
    }
    const value = this.campaignForm.getRawValue();
    this.run(
      this.admin.createCampaign({ ...value, languageId: value.languageId as number }),
      (created) => {
        this.campaigns.update((list) => [created, ...list]);
        this.campaignForm.reset({ kind: 'OPEN' });
        this.promptsFor.set(created.id);
        this.notice.set({ text: 'admin.camp.created', ok: true });
      },
      false,
    );
  }

  protected setCampaignStatus(campaign: AdminCampaign, status: CampaignStatus): void {
    this.run(this.admin.setCampaignStatus(campaign.id, status), (updated) =>
      this.campaigns.update((list) => list.map((c) => (c.id === updated.id ? updated : c))),
    );
  }

  protected togglePrompts(id: number): void {
    this.promptsFor.update((current) => (current === id ? null : id));
    this.promptsForm.reset();
    this.notice.set(null);
  }

  protected addPrompts(campaignId: number): void {
    if (this.promptsForm.invalid || this.busy()) return;
    const sentences = this.promptsForm.controls.text.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (sentences.length === 0) return;
    if (sentences.length > MAX_PROMPTS_PER_BATCH) {
      this.notice.set({ text: 'admin.camp.promptsTooMany', ok: false });
      return;
    }
    if (sentences.some((s) => s.length > MAX_PROMPT_LENGTH)) {
      this.notice.set({ text: 'admin.camp.promptsTooLong', ok: false });
      return;
    }
    this.busy.set(true);
    this.admin.addPrompts(campaignId, sentences).subscribe({
      next: (count) => {
        this.promptsForm.reset();
        this.notice.set({ text: 'admin.camp.promptsAdded', ok: true, count });
        this.busy.set(false);
      },
      // Échec partiel possible (requêtes parallèles) : on demande de vérifier avant de renvoyer
      error: () => {
        this.notice.set({ text: 'admin.camp.promptsFailed', ok: false });
        this.busy.set(false);
      },
    });
  }

  /** Exécute une action serveur avec le retour utilisateur commun (occupé, succès, échec). */
  private run<T>(
    call: Observable<T>,
    onSuccess: (result: T) => void,
    announce = true,
  ): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    call.subscribe({
      next: (result) => {
        onSuccess(result);
        if (announce) this.notice.set({ text: 'admin.saved', ok: true });
        this.busy.set(false);
      },
      error: () => {
        this.notice.set({ text: 'admin.failed', ok: false });
        this.busy.set(false);
      },
    });
  }
}
