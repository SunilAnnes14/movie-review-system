import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page container not-found-page">
      <div class="not-found-content">
        <h1 class="code">404</h1>
        <h2>Lost in the Cinema?</h2>
        <p>The page you are looking for doesn't exist or has been moved to another reel.</p>
        <div class="actions">
          <a routerLink="/" class="btn btn-primary">Back to Home</a>
          <a routerLink="/movies" class="btn btn-secondary">Explore Movies</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .not-found-page {
      min-height: calc(100vh - 160px);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .not-found-content {
      max-width: 500px;
      padding: 40px;
    }
    .code {
      font-size: 7rem;
      font-weight: 900;
      color: var(--accent-red);
      line-height: 1;
      margin-bottom: 16px;
      text-shadow: 0 0 30px rgba(229, 9, 20, 0.4);
    }
    h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 12px;
      color: var(--text-primary);
    }
    p {
      color: var(--text-secondary);
      margin-bottom: 28px;
      font-size: 1.05rem;
    }
    .actions {
      display: flex;
      gap: 16px;
      justify-content: center;
    }
  `]
})
export class NotFoundComponent {}
