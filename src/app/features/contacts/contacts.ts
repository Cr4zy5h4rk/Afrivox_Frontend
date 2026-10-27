import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import { ContactReceived, ContactSent, ContactStatus, HubService } from '../../core/api/hub.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/**
 * Mes contacts : demandes reçues (que l'on accepte ou décline) et demandes envoyées. Le moyen de joindre l'expéditeur
 * n'apparaît que dans les demandes reçues ; l'adresse du destinataire n'est jamais montrée.
 */
@Component({
  selector: 'app-contacts',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './contacts.html',
  styleUrl: './contacts.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactsPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly hub = inject(HubService);

  protected readonly received = signal<ContactReceived[]>([]);
  protected readonly sent = signal<ContactSent[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly error = signal<ApiError | null>(null);
  protected readonly busy = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.hub.received().subscribe({
      next: (list) => {
        this.received.set(list);
        this.hub.sent().subscribe({
          next: (sent) => {
            this.sent.set(sent);
            this.state.set('ready');
          },
          error: () => this.state.set('failed'),
        });
      },
      error: () => this.state.set('failed'),
    });
  }

  protected answer(request: ContactReceived, accept: boolean): void {
    if (this.busy() !== null) return;
    this.busy.set(request.id);
    this.error.set(null);
    this.hub.answer(request.id, accept).subscribe({
      next: () => {
        this.busy.set(null);
        this.received.update((list) =>
          list.map((r) => (r.id === request.id ? { ...r, status: accept ? 'ACCEPTED' : 'DECLINED' } : r)),
        );
      },
      error: (err: unknown) => {
        this.busy.set(null);
        this.error.set(toApiError(err));
      },
    });
  }

  protected statusKey(status: ContactStatus): TranslationKey {
    return `contacts.status.${status}` as TranslationKey;
  }
}
