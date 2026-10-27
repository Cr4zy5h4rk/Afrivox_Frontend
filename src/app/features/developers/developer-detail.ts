import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api-error';
import { DeveloperProfile, HubService } from '../../core/api/hub.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ModelCard } from '../../core/ui/model-card';

/** Profil public d'un développeur : présentation, modèles, projets et, pour une organisation, demande de contact. */
@Component({
  selector: 'app-developer-detail',
  imports: [MatButtonModule, RouterLink, ModelCard],
  templateUrl: './developer-detail.html',
  styleUrl: './developer-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeveloperDetailPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly auth = inject(AuthService);
  private readonly hub = inject(HubService);

  /** Paramètre de route `:id` (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly profile = signal<DeveloperProfile | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'notfound' | 'failed'>('loading');

  // ---- Demande de contact ----
  protected readonly message = signal('');
  protected readonly how = signal('');
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  ngOnInit(): void {
    const id = Number(this.id());
    if (!Number.isInteger(id)) {
      this.state.set('notfound');
      return;
    }
    this.hub.developer(id).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.state.set('ready');
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'failed'),
    });
  }

  /** Seules les organisations (et l'admin) envoient une demande ; le serveur le vérifie aussi. */
  protected canContact(): boolean {
    return this.auth.hasRole('ROLE_ORGANIZATION') || this.auth.hasRole('ROLE_ADMIN');
  }

  protected send(): void {
    const profile = this.profile();
    const message = this.message().trim();
    const how = this.how().trim();
    if (!profile || this.sending() || message === '' || how === '') return;
    this.sending.set(true);
    this.error.set(null);
    this.hub.contact(profile.id, message, how).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
        this.message.set('');
        this.how.set('');
      },
      error: (err: unknown) => {
        this.error.set(toApiError(err));
        this.sending.set(false);
      },
    });
  }
}
