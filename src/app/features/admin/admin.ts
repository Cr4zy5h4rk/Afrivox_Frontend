import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable, switchMap } from 'rxjs';
import {
  AdminCampaignRow,
  AdminLanguage,
  AdminRequest,
  AdminService,
  CampaignKind,
  CampaignStatus,
  REQUEST_FLOW,
  RequestStatus,
} from '../../core/api/admin.service';
import { CreditService, MAX_CREDIT_RATE } from '../../core/api/credit.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';
import { AdminContributorsSection } from './contributors/admin-contributors';
import { AdminCreditsSection } from './credits/admin-credits';
import { AdminDatasetsSection } from './datasets/admin-datasets';
import { AdminLanguagesSection } from './languages/admin-languages';
import { AdminLeaksSection } from './leaks/admin-leaks';
import { AdminModerationSection } from './moderation/admin-moderation';
import { AdminUsersSection } from './users/admin-users';
import { MAX_SENTENCES_PER_BATCH, parseSentences } from './sentences';

type Tab =
  | 'requests'
  | 'campaigns'
  | 'languages'
  | 'datasets'
  | 'users'
  | 'contributors'
  | 'leaks'
  | 'credits'
  | 'moderation';

/** Taille maximale d'un fichier de phrases importé (lu en mémoire dans le navigateur). */
const MAX_IMPORT_BYTES = 512 * 1024;

const CAMPAIGN_PAGE_SIZE = 20;
const REQUEST_PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

interface Notice {
  text: TranslationKey;
  ok: boolean;
  params?: Record<string, number>;
}

/**
 * Espace d'administration du MVP : suivi des demandes des organisations (statut + devis)
 * et gestion des campagnes (création, phrases, activation). Réservé à ROLE_ADMIN (garde de route
 * et règle serveur).
 */
@Component({
  selector: 'app-admin',
  imports: [
    AdminContributorsSection,
    AdminCreditsSection,
    AdminDatasetsSection,
    AdminLanguagesSection,
    AdminLeaksSection,
    AdminUsersSection,
    AdminModerationSection,
    NgTemplateOutlet,
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
  private readonly credits = inject(CreditService);
  protected readonly maxCreditRate = MAX_CREDIT_RATE;

  protected readonly tab = signal<Tab>('requests');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Retour d'une action (succès ou échec), annoncé aux lecteurs d'écran. */
  protected readonly notice = signal<Notice | null>(null);

  protected readonly requests = signal<AdminRequest[]>([]);
  protected readonly requestTotal = signal(0);
  protected readonly requestPage = signal(0);
  protected readonly requestPages = computed(() => Math.max(1, Math.ceil(this.requestTotal() / REQUEST_PAGE_SIZE)));
  // Filtres cumulables, appliqués côté serveur
  protected readonly reqQuery = signal('');
  protected readonly reqStatus = signal<RequestStatus | ''>('');
  protected readonly reqSector = signal('');
  protected readonly reqLanguage = signal<number | null>(null);
  protected readonly reqUsage = signal<'COMMERCIAL' | 'RESEARCH' | ''>('');
  protected readonly requestStatuses: readonly RequestStatus[] = [...REQUEST_FLOW, 'REJECTED'];
  protected readonly sectors = ['BANK', 'TELECOM', 'HEALTH', 'PUBLIC', 'EDUCATION', 'STARTUP', 'RESEARCH', 'OTHER'];
  protected readonly campaigns = signal<AdminCampaignRow[]>([]);
  protected readonly campaignTotal = signal(0);
  protected readonly campaignPage = signal(0);
  protected readonly campaignPages = computed(() =>
    Math.max(1, Math.ceil(this.campaignTotal() / CAMPAIGN_PAGE_SIZE)),
  );
  protected readonly campaignDomains = signal<string[]>([]);
  // Filtres cumulables, appliqués côté serveur
  protected readonly campQuery = signal('');
  protected readonly campLanguage = signal<number | null>(null);
  protected readonly campKind = signal<CampaignKind | ''>('');
  protected readonly campStatus = signal<CampaignStatus | ''>('');
  protected readonly campDomain = signal('');
  /** Campagne dont le formulaire de modification est ouvert. */
  protected readonly editingCampaign = signal<number | null>(null);
  protected readonly statuses: CampaignStatus[] = ['DRAFT', 'ACTIVE', 'CLOSED'];
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly languages = signal<AdminLanguage[]>([]);
  /** Montants de devis en cours de saisie, par identifiant de demande. */
  protected readonly quotes = signal<Record<number, string>>({});
  /** Campagne dont le formulaire « ajouter des phrases » est ouvert. */
  protected readonly promptsFor = signal<number | null>(null);
  protected readonly busy = signal(false);
  /** Le formulaire de création reste replié tant qu'on n'en a pas besoin : la liste passe d'abord. */
  protected readonly showForm = signal(false);

  protected readonly kinds: CampaignKind[] = ['OPEN', 'SPONSORED', 'PRIVATE'];
  protected readonly maxPerBatch = MAX_SENTENCES_PER_BATCH;

  protected readonly campaignForm = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', Validators.maxLength(1000)],
    domain: ['', Validators.maxLength(80)],
    kind: ['OPEN' as CampaignKind, Validators.required],
    targetSentences: [null as number | null, [Validators.min(1), Validators.max(100000)]],
    languageId: [null as number | null, Validators.required],
    sentences: [''],
    // Tarifs de crédits propres à la campagne ; vide = tarif global
    creditValidatedRecording: [null as number | null, [Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
    creditReviewAgreed: [null as number | null, [Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
    creditTrapCorrect: [null as number | null, [Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
  });

  protected readonly promptsForm = inject(FormBuilder).nonNullable.group({
    text: ['', Validators.required],
  });

  /** Analyse en direct des phrases saisies (compteurs, doublons, lignes trop longues). */
  private readonly createText = toSignal(this.campaignForm.controls.sentences.valueChanges, {
    initialValue: '',
  });
  private readonly addText = toSignal(this.promptsForm.controls.text.valueChanges, {
    initialValue: '',
  });
  protected readonly createStats = computed(() => parseSentences(this.createText()));
  protected readonly addStats = computed(() => parseSentences(this.addText()));

  protected readonly editCampaignForm = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', Validators.maxLength(1000)],
    domain: ['', Validators.maxLength(80)],
    targetSentences: [null as number | null, [Validators.min(1), Validators.max(100000)]],
    creditValidatedRecording: [null as number | null, [Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
    creditReviewAgreed: [null as number | null, [Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
    creditTrapCorrect: [null as number | null, [Validators.min(0), Validators.max(MAX_CREDIT_RATE)]],
  });

  ngOnInit(): void {
    // Pas de requête de recherche qui part après la fermeture de la page
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.loadCampaigns();
    this.loadRequests();
    this.admin.languages().subscribe({
      next: (l) => {
        this.languages.set(l);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Recharge la page courante de demandes (filtres inclus). */
  protected loadRequests(): void {
    const filter = {
      query: this.reqQuery(),
      status: this.reqStatus(),
      sector: this.reqSector(),
      languageId: this.reqLanguage(),
      usageKind: this.reqUsage(),
    };
    this.admin.requestOverview(filter, this.requestPage(), REQUEST_PAGE_SIZE).subscribe({
      next: ({ items, total }) => {
        this.requests.set(items);
        this.requestTotal.set(total);
      },
      error: () => this.failed.set(true),
    });
  }

  protected searchRequests(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.reqQuery.set(value);
      this.refilterRequests();
    }, SEARCH_DELAY_MS);
  }

  protected setReqStatus(event: Event): void {
    this.reqStatus.set((event.target as HTMLSelectElement).value as RequestStatus | '');
    this.refilterRequests();
  }

  protected setReqSector(event: Event): void {
    this.reqSector.set((event.target as HTMLSelectElement).value);
    this.refilterRequests();
  }

  protected setReqLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.reqLanguage.set(value === '' ? null : Number(value));
    this.refilterRequests();
  }

  protected setReqUsage(event: Event): void {
    this.reqUsage.set((event.target as HTMLSelectElement).value as 'COMMERCIAL' | 'RESEARCH' | '');
    this.refilterRequests();
  }

  /** Un filtre qui change ramène à la première page. */
  private refilterRequests(): void {
    this.requestPage.set(0);
    this.loadRequests();
  }

  protected goToRequestPage(page: number): void {
    if (page < 0 || page >= this.requestPages()) return;
    this.requestPage.set(page);
    this.loadRequests();
  }

  /** Recharge la page courante de campagnes (filtres inclus) ; les compteurs viennent du serveur. */
  protected loadCampaigns(): void {
    const filter = {
      query: this.campQuery(),
      languageId: this.campLanguage(),
      kind: this.campKind(),
      status: this.campStatus(),
      domain: this.campDomain(),
    };
    this.admin.campaignOverview(filter, this.campaignPage(), CAMPAIGN_PAGE_SIZE).subscribe({
      next: ({ items, total }) => {
        this.campaigns.set(items);
        this.campaignTotal.set(total);
      },
      error: () => this.failed.set(true),
    });
    this.admin.campaignDomains().subscribe({ next: (d) => this.campaignDomains.set(d), error: () => undefined });
  }

  protected searchCampaigns(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.campQuery.set(value);
      this.refilterCampaigns();
    }, SEARCH_DELAY_MS);
  }

  protected setCampLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.campLanguage.set(value === '' ? null : Number(value));
    this.refilterCampaigns();
  }

  protected setCampKind(event: Event): void {
    this.campKind.set((event.target as HTMLSelectElement).value as CampaignKind | '');
    this.refilterCampaigns();
  }

  protected setCampStatusFilter(event: Event): void {
    this.campStatus.set((event.target as HTMLSelectElement).value as CampaignStatus | '');
    this.refilterCampaigns();
  }

  protected setCampDomain(event: Event): void {
    this.campDomain.set((event.target as HTMLSelectElement).value);
    this.refilterCampaigns();
  }

  /** Un filtre qui change ramène à la première page. */
  private refilterCampaigns(): void {
    this.campaignPage.set(0);
    this.loadCampaigns();
  }

  protected goToCampaignPage(page: number): void {
    if (page < 0 || page >= this.campaignPages()) return;
    this.campaignPage.set(page);
    this.loadCampaigns();
  }

  /** Part des phrases déjà enregistrées par rapport à l'objectif, plafonnée à 100 % (barre de progression). */
  protected campProgress(c: AdminCampaignRow): number | null {
    return c.targetSentences ? Math.min(100, Math.round((c.recordingsValidated / c.targetSentences) * 100)) : null;
  }

  protected toggleEditCampaign(c: AdminCampaignRow): void {
    if (this.editingCampaign() === c.id) {
      this.editingCampaign.set(null);
      return;
    }
    this.editingCampaign.set(c.id);
    this.promptsFor.set(null);
    this.notice.set(null);
    this.editCampaignForm.reset({
      title: c.title,
      description: c.description ?? '',
      domain: c.domain ?? '',
      targetSentences: c.targetSentences,
      creditValidatedRecording: c.creditValidatedRecording,
      creditReviewAgreed: c.creditReviewAgreed,
      creditTrapCorrect: c.creditTrapCorrect,
    });
  }

  protected saveCampaign(c: AdminCampaignRow): void {
    if (this.editCampaignForm.invalid || this.busy()) {
      this.editCampaignForm.markAllAsTouched();
      return;
    }
    const value = this.editCampaignForm.getRawValue();
    this.run(
      this.admin
        .updateCampaign(c.id, {
          title: value.title.trim(),
          description: value.description.trim() || null,
          domain: value.domain.trim() || null,
          targetSentences: value.targetSentences,
        })
        // Les tarifs passent par un appel dédié : un PATCH ignore les valeurs nulles, il ne pourrait pas
        // ramener un tarif au tarif global.
        .pipe(
          switchMap(() =>
            this.credits.setCampaignRates(c.id, {
              validatedRecording: value.creditValidatedRecording,
              reviewAgreed: value.creditReviewAgreed,
              trapCorrect: value.creditTrapCorrect,
            }),
          ),
        ),
      () => {
        this.editingCampaign.set(null);
        this.loadCampaigns();
      },
    );
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
      // Recharge la page : le nouvel état peut sortir la demande du filtre en cours
      () => this.loadRequests(),
    );
  }

  // ---------- Campagnes ----------

  protected campStatusKey(status: CampaignStatus): TranslationKey {
    return `campstatus.${status}`;
  }

  protected campKindKey(kind: CampaignKind): TranslationKey {
    return `campkind.${kind}`;
  }

  /** Couleur du badge de statut (classes `.badge` du design system) : jaune = à traiter, vert = en bonne voie. */
  protected reqTone(status: RequestStatus): string {
    switch (status) {
      case 'RECEIVED':
        return 'gold';
      case 'QUOTED':
        return 'accent';
      case 'ACCEPTED':
      case 'COLLECTING':
      case 'DELIVERED':
        return 'green';
      case 'REJECTED':
        return 'gray';
      default:
        return '';
    }
  }

  protected campTone(status: CampaignStatus): string {
    return status === 'ACTIVE' ? 'green' : status === 'DRAFT' ? 'gold' : 'gray';
  }

  protected toggleForm(): void {
    this.showForm.update((open) => !open);
    this.notice.set(null);
  }

  /**
   * Crée la campagne (brouillon), puis y ajoute les phrases saisies ou importées. Si certaines phrases
   * échouent, la campagne existe quand même et les phrases en échec restent dans la zone « ajouter ».
   */
  protected createCampaign(): void {
    const sentences = this.createStats();
    if (this.campaignForm.invalid || this.busy()) {
      this.campaignForm.markAllAsTouched();
      return;
    }
    if (sentences.valid.length > MAX_SENTENCES_PER_BATCH) {
      this.notice.set({ text: 'admin.camp.promptsTooMany', ok: false, params: { max: MAX_SENTENCES_PER_BATCH } });
      return;
    }
    const value = this.campaignForm.getRawValue();
    this.busy.set(true);
    this.notice.set(null);
    this.admin
      .createCampaign({
        ...value,
        // Sans objectif saisi, on retient le nombre de phrases fournies
        targetSentences: value.targetSentences ?? (sentences.valid.length || null),
        languageId: value.languageId as number,
      })
      .subscribe({
        next: (created) => {
          this.loadCampaigns();
          this.campaignForm.reset({ kind: 'OPEN' });
          this.showForm.set(false);
          if (sentences.valid.length === 0) {
            this.busy.set(false);
            this.notice.set({ text: 'admin.camp.created', ok: true });
            return;
          }
          this.sendSentences(created.id, sentences.valid, 'admin.camp.createdWith');
        },
        error: () => {
          this.notice.set({ text: 'admin.failed', ok: false });
          this.busy.set(false);
        },
      });
  }

  protected setCampaignStatus(campaign: AdminCampaignRow, status: CampaignStatus): void {
    // Recharge la page : l'état change aussi ce que les filtres laissent voir
    this.run(this.admin.setCampaignStatus(campaign.id, status), () => this.loadCampaigns());
  }

  protected togglePrompts(id: number): void {
    this.promptsFor.update((current) => (current === id ? null : id));
    this.editingCampaign.set(null);
    this.promptsForm.reset();
    this.notice.set(null);
  }

  protected addPrompts(campaignId: number): void {
    const sentences = this.addStats().valid;
    if (sentences.length === 0 || this.busy()) return;
    if (sentences.length > MAX_SENTENCES_PER_BATCH) {
      this.notice.set({ text: 'admin.camp.promptsTooMany', ok: false, params: { max: MAX_SENTENCES_PER_BATCH } });
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
    this.sendSentences(campaignId, sentences, 'admin.camp.promptsAdded');
  }

  /** Charge un fichier texte (une phrase par ligne) dans la zone de saisie visée, à la suite du contenu existant. */
  protected async importFile(event: Event, target: 'create' | 'add'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permet de choisir deux fois le même fichier
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      this.notice.set({ text: 'admin.camp.fileTooBig', ok: false });
      return;
    }
    const control =
      target === 'create' ? this.campaignForm.controls.sentences : this.promptsForm.controls.text;
    const text = await file.text();
    control.setValue(control.value ? `${control.value.replace(/\s+$/, '')}\n${text}` : text);
    this.notice.set(null);
  }

  /**
   * Envoie les phrases et rend compte. Les phrases en échec sont replacées dans la zone « ajouter » de la
   * campagne : un nouvel essai ne recrée pas de doublons parmi celles déjà enregistrées.
   */
  private sendSentences(campaignId: number, sentences: string[], successText: TranslationKey): void {
    this.admin.addPrompts(campaignId, sentences).subscribe({
      next: (failedSentences) => {
        const added = sentences.length - failedSentences.length;
        this.promptsForm.reset({ text: failedSentences.join('\n') });
        this.loadCampaigns();
        if (failedSentences.length === 0) {
          if (this.promptsFor() === campaignId) this.promptsFor.set(null);
          this.notice.set({ text: successText, ok: true, params: { count: added } });
        } else {
          this.promptsFor.set(campaignId);
          this.notice.set({
            text: 'admin.camp.promptsPartial',
            ok: false,
            params: { added, failed: failedSentences.length },
          });
        }
        this.busy.set(false);
      },
      error: () => {
        this.notice.set({ text: 'admin.failed', ok: false });
        this.busy.set(false);
      },
    });
  }

  /** Exécute une action serveur avec le retour utilisateur commun (occupé, succès, échec). */
  private run<T>(call: Observable<T>, onSuccess: (result: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    call.subscribe({
      next: (result) => {
        onSuccess(result);
        this.notice.set({ text: 'admin.saved', ok: true });
        this.busy.set(false);
      },
      error: () => {
        this.notice.set({ text: 'admin.failed', ok: false });
        this.busy.set(false);
      },
    });
  }
}
