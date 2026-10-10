import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AdminService, AdminUser } from '../../../core/api/admin.service';
import { AuthService } from '../../../core/auth/auth.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

interface Notice {
  text: TranslationKey;
  ok: boolean;
}

/** Rôles attribuables par l'administrateur ; ROLE_USER est toujours conservé (voir `withRoles`). */
const ASSIGNABLE_ROLES = ['ROLE_CONTRIBUTOR', 'ROLE_DEVELOPER', 'ROLE_ORGANIZATION', 'ROLE_ADMIN'] as const;

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

/**
 * Utilisateurs : recherche (identifiant ou e-mail), activation / désactivation et rôles.
 * Pas de suppression : un compte porte des enregistrements, avis et achats ; on le désactive.
 * Le serveur refuse qu'un admin se désactive ou se retire le rôle admin (le bouton est aussi masqué ici).
 */
@Component({
  selector: 'app-admin-users',
  imports: [MatButtonModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly query = signal('');
  protected readonly role = signal('');
  /** Tous / actifs / désactivés. */
  protected readonly status = signal<'all' | 'active' | 'inactive'>('all');
  /** Les comptes de test sont masqués par défaut : la liste montre d'abord les vrais utilisateurs. */
  protected readonly excludeTest = signal(true);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly roles = ASSIGNABLE_ROLES;
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Pas de requête de recherche qui part après la fermeture de l'onglet
    this.destroyRef.onDestroy(() => clearTimeout(this.searchTimer));
  }

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    const status = this.status();
    const filter = {
      query: this.query(),
      role: this.role(),
      activated: status === 'all' ? null : status === 'active',
      excludeTest: this.excludeTest(),
    };
    this.admin.users(filter, this.page(), PAGE_SIZE).subscribe({
      next: ({ items, total }) => {
        this.users.set(items);
        this.total.set(total);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Recherche différée : une requête par pause de frappe, pas une par lettre. */
  protected search(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query.set(value);
      this.page.set(0);
      this.load();
    }, SEARCH_DELAY_MS);
  }

  protected setRole(event: Event): void {
    this.role.set((event.target as HTMLSelectElement).value);
    this.refilter();
  }

  protected setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as 'all' | 'active' | 'inactive');
    this.refilter();
  }

  protected setExcludeTest(event: Event): void {
    this.excludeTest.set((event.target as HTMLInputElement).checked);
    this.refilter();
  }

  /** Un filtre qui change ramène à la première page. */
  private refilter(): void {
    this.page.set(0);
    this.load();
  }

  protected goTo(page: number): void {
    if (page < 0 || page >= this.pages()) return;
    this.page.set(page);
    this.load();
  }

  protected isSelf(user: AdminUser): boolean {
    return this.auth.account()?.login.toLowerCase() === user.login.toLowerCase();
  }

  protected hasRole(user: AdminUser, role: string): boolean {
    return user.authorities.includes(role);
  }

  protected roleKey(role: string): TranslationKey {
    return `role.${role.replace('ROLE_', '')}` as TranslationKey;
  }

  protected fullName(user: AdminUser): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }

  protected toggleActivated(user: AdminUser): void {
    if (user.activated) {
      const message = this.i18n.t('adminusers.confirmDeactivate', { login: user.login });
      if (!window.confirm(message)) return;
    }
    this.save(user, { activated: !user.activated });
  }

  protected toggleRole(user: AdminUser, role: string): void {
    const granting = !this.hasRole(user, role);
    // Donner ROLE_ADMIN ouvre toute l'administration : confirmation explicite
    if (granting && role === 'ROLE_ADMIN') {
      const message = this.i18n.t('adminusers.confirmAdmin', { login: user.login });
      if (!window.confirm(message)) return;
    }
    const others = user.authorities.filter((r) => r !== role);
    this.save(user, { authorities: granting ? [...others, role] : others });
  }

  private save(user: AdminUser, change: { activated?: boolean; authorities?: string[] }): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    this.admin.updateUser(user, change).subscribe({
      next: (updated) => {
        this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
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
