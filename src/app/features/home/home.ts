import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationKey } from '../../core/i18n/translations';

/** Rôles affichables, avec la clé de traduction de leur libellé et de leur carte d'accueil. */
const ROLE_LABELS: Record<string, { label: TranslationKey; card?: TranslationKey }> = {
  ROLE_ADMIN: { label: 'role.ADMIN', card: 'home.card.ADMIN' },
  ROLE_CONTRIBUTOR: { label: 'role.CONTRIBUTOR', card: 'home.card.CONTRIBUTOR' },
  ROLE_DEVELOPER: { label: 'role.DEVELOPER', card: 'home.card.DEVELOPER' },
  ROLE_ORGANIZATION: { label: 'role.ORGANIZATION', card: 'home.card.ORGANIZATION' },
  ROLE_USER: { label: 'role.USER' },
};

@Component({
  selector: 'app-home',
  imports: [MatCardModule, MatChipsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  protected readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);

  protected readonly name = computed(() => {
    const account = this.auth.account();
    return account?.firstName || account?.login || '';
  });

  protected readonly roles = computed(() =>
    this.auth
      .roles()
      .map((role) => ROLE_LABELS[role])
      .filter((entry) => entry !== undefined),
  );

  /** Une carte par fonctionnalité accessible au rôle ; elles seront activées au fil des étapes. */
  protected readonly cards = computed(() =>
    this.roles().flatMap((entry) => (entry.card ? [entry.card] : [])),
  );
}
