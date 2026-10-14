import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ReviewService } from '../../services/review.service';
import { User } from '../../models/user.model';
import { Review } from '../../models/review.model';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  recentReviews: Review[] = [];
  loading = true;
  editing = false;
  editName = '';
  editEmail = '';
  message = '';
  messageType = '';

  constructor(
    private authService: AuthService,
    private reviewService: ReviewService
  ) {}

  ngOnInit(): void {
    this.loadProfile();
    this.loadReviews();
  }

  loadProfile(): void {
    this.authService.getProfile().subscribe({
      next: (user) => {
        this.user = user;
        this.editName = user.name;
        this.editEmail = user.email;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  loadReviews(): void {
    this.reviewService.getMyReviews().subscribe({
      next: (reviews) => this.recentReviews = reviews.slice(0, 5)
    });
  }

  startEdit(): void {
    this.editing = true;
  }

  cancelEdit(): void {
    this.editing = false;
    if (this.user) {
      this.editName = this.user.name;
      this.editEmail = this.user.email;
    }
  }

  saveProfile(): void {
    this.authService.updateProfile({ name: this.editName, email: this.editEmail } as any).subscribe({
      next: () => {
        this.editing = false;
        this.loadProfile();
        this.showMessage('Profile updated successfully!', 'success');
      },
      error: (err) => this.showMessage(err.error?.message || 'Update failed', 'error')
    });
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  private showMessage(msg: string, type: string): void {
    this.message = msg;
    this.messageType = type;
    setTimeout(() => this.message = '', 4000);
  }
}
