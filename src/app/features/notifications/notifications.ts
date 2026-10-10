import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { CommunityService, NotificationView } from '../../core/api/community.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Notifications de la communauté : commentaires sur mes modèles et réponses à mes commentaires. */
@Component({
  selector: 'app-notifications',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly community = inject(CommunityService);

  protected readonly items = signal<NotificationView[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');

  ngOnInit(): void {
    this.community.notifications().subscribe({
      next: (list) => {
        this.items.set(list.items);
        this.state.set('ready');
        // Ouvrir la page vaut lecture : le compteur de l'en-tête repart à zéro à la prochaine navigation.
        if (list.unread > 0) this.community.readAll().subscribe({ error: () => undefined });
      },
      error: () => this.state.set('failed'),
    });
  }

  protected text(n: NotificationView): string {
    const key = `notif.${n.type}` as TranslationKey;
    return this.i18n.t(key, { actor: n.actorName ?? '?', model: n.modelName ?? '?' });
  }
}
