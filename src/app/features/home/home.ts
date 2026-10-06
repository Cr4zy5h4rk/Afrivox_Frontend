import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { OutboxService } from '../../core/audio/outbox.service';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

interface Action {
  title: TranslationKey;
  body: TranslationKey;
  /** Lien actif, ou absent : l'action est annoncée « bientôt disponible ». */
  link?: string;
}

const ROLE_LABELS: Record<string, TranslationKey> = {
  ROLE_ADMIN: 'role.ADMIN',
  ROLE_CONTRIBUTOR: 'role.CONTRIBUTOR',
  ROLE_DEVELOPER: 'role.DEVELOPER',
  ROLE_ORGANIZATION: 'role.ORGANIZATION',
  ROLE_USER: 'role.USER',
};

/** Espace personnel : ce que l'utilisateur peut faire selon ses rôles. */
@Component({
  selector: 'app-home',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly i18n = inject(I18nService);
  protected readonly outbox = inject(OutboxService);
  private readonly auth = inject(AuthService);

  protected readonly name = computed(() => {
    const account = this.auth.account();
    return account?.firstName || account?.login || '';
  });

  protected readonly roles = computed(() =>
    this.auth
      .roles()
      .map((role) => ROLE_LABELS[role])
      .filter((label) => label !== undefined),
  );

  /** Actions proposées : une par usage accessible au rôle (celles pas encore construites sont signalées). */
  protected readonly actions = computed<Action[]>(() => {
    const list: Action[] = [];
    if (this.auth.hasRole('ROLE_CONTRIBUTOR') || this.auth.hasRole('ROLE_ADMIN')) {
      list.push({ title: 'dash.record.title', body: 'dash.record.body', link: '/record' });
    }
    list.push({ title: 'dash.datasets.title', body: 'dash.datasets.body', link: '/datasets' });
    if (this.auth.hasRole('ROLE_DEVELOPER') || this.auth.hasRole('ROLE_ADMIN')) {
      list.push({ title: 'dash.models.title', body: 'dash.models.body', link: '/models/new' });
    }
    if (this.auth.hasRole('ROLE_ORGANIZATION')) {
      list.push({ title: 'dash.org.title', body: 'dash.org.body' });
    }
    if (this.auth.hasRole('ROLE_ADMIN')) {
      list.push({ title: 'dash.admin.title', body: 'dash.admin.body' });
    }
    return list;
  });
}
