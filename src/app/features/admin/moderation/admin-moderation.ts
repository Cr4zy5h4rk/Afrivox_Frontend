import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { CatalogService } from '../../../core/api/catalog.service';
import { CommunityService, ReportedComment } from '../../../core/api/community.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationKey } from '../../../core/i18n/translations';

/**
 * File de modération : commentaires signalés par les utilisateurs. Deux issues : ignorer les signalements (le
 * commentaire reste) ou supprimer le commentaire (ses réponses et ses signalements partent avec lui).
 */
@Component({
  selector: 'app-admin-moderation',
  imports: [MatButtonModule, RouterLink],
  templateUrl: './admin-moderation.html',
  styleUrl: './admin-moderation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminModerationSection implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly community = inject(CommunityService);
  private readonly catalog = inject(CatalogService);

  protected readonly items = signal<ReportedComment[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.community.reportedComments().subscribe({
      next: (list) => {
        this.items.set(list);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  protected dismiss(item: ReportedComment): void {
    this.community.dismissReports(item.commentId).subscribe({ next: () => this.load(), error: () => undefined });
  }

  protected remove(item: ReportedComment): void {
    if (!window.confirm(this.i18n.t('adminmod.deleteConfirm'))) return;
    this.catalog.deleteComment(item.commentId).subscribe({ next: () => this.load(), error: () => undefined });
  }

  protected reasonKey(reason: string): TranslationKey {
    return `report.${reason}` as TranslationKey;
  }
}
