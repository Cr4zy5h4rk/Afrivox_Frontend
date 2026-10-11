import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  AdminContributor,
  AdminContributorStatus,
  AdminService,
} from '../../../core/api/admin.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

const PAGE_SIZE = 20;

/**
 * Contributeurs et période d'essai. Un nouveau contributeur est « en essai » ; il devient actif tout seul quand ses
 * premiers enregistrements sont relus et assez valides. Ici, l'admin tranche les cas restants (activer, suspendre).
 */
@Component({
  selector: 'app-admin-contributors',
  imports: [MatButtonModule],
  templateUrl: './admin-contributors.html',
  styleUrl: './admin-contributors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminContributorsSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly admin = inject(AdminService);

  protected readonly statuses: readonly AdminContributorStatus[] = ['TRIAL', 'ACTIVE', 'SUSPENDED'];
  protected readonly filter = signal<AdminContributorStatus | ''>('TRIAL');
  protected readonly items = signal<AdminContributor[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.admin.contributors(this.filter(), this.page(), PAGE_SIZE).subscribe({
      next: ({ items, total }) => {
        this.items.set(items);
        this.total.set(total);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected setFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as AdminContributorStatus | '');
    this.page.set(0);
    this.load();
  }

  protected goTo(page: number): void {
    if (page < 0 || page >= this.pages()) return;
    this.page.set(page);
    this.load();
  }

  protected decide(contributor: AdminContributor, status: AdminContributorStatus): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.admin.setContributorStatus(contributor.id, status).subscribe({
      next: () => {
        this.busy.set(false);
        this.load(); // le nouvel état peut sortir la ligne du filtre en cours
      },
      error: () => {
        this.busy.set(false);
        this.state.set('failed');
      },
    });
  }

  protected statusKey(status: AdminContributorStatus): TranslationKey {
    return `contribstatus.${status}` as TranslationKey;
  }

  protected tone(status: AdminContributorStatus): string {
    return status === 'ACTIVE' ? 'green' : status === 'TRIAL' ? 'gold' : 'gray';
  }
}
