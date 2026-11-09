import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { HubService, ProjectView } from '../../core/api/hub.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Avatar } from '../../core/ui/avatar';
import { CommentsSection } from '../../core/ui/comments-section';

/** Fiche d'un projet : description, liens extérieurs, modèle lié, auteur et discussion publique. */
@Component({
  selector: 'app-project-detail',
  imports: [MatButtonModule, RouterLink, CommentsSection, Avatar],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailPage implements OnInit {
  protected readonly i18n = inject(I18nService);
  private readonly hub = inject(HubService);
  private readonly router = inject(Router);

  /** Paramètre de route `:id` (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly project = signal<ProjectView | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'notfound' | 'failed'>('loading');

  ngOnInit(): void {
    const id = Number(this.id());
    if (!Number.isInteger(id)) {
      this.state.set('notfound');
      return;
    }
    this.hub.project(id).subscribe({
      next: (project) => {
        this.project.set(project);
        this.state.set('ready');
      },
      error: (error: unknown) =>
        this.state.set(error instanceof HttpErrorResponse && error.status === 404 ? 'notfound' : 'failed'),
    });
  }

  protected remove(project: ProjectView): void {
    if (!window.confirm(this.i18n.t('project.deleteConfirm'))) return;
    this.hub.deleteProject(project.id).subscribe({
      next: () => void this.router.navigateByUrl('/projects'),
      error: () => undefined,
    });
  }
}
