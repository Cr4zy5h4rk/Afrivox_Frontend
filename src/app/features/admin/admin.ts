import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
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
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';
import { MAX_SENTENCES_PER_BATCH, parseSentences } from './sentences';

type Tab = 'requests' | 'campaigns';

/** Taille maximale d'un fichier de phrases importé (lu en mémoire dans le navigateur). */
const MAX_IMPORT_BYTES = 512 * 1024;

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

  protected readonly tab = signal<Tab>('requests');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** Retour d'une action (succès ou échec), annoncé aux lecteurs d'écran. */
  protected readonly notice = signal<Notice | null>(null);

  protected readonly requests = signal<AdminRequest[]>([]);
  protected readonly campaigns = signal<AdminCampaign[]>([]);
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
          this.campaigns.update((list) => [created, ...list]);
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
