import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReviewService } from '../../services/review.service';
import { Review } from '../../models/review.model';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-my-reviews',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './my-reviews.component.html',
  styleUrl: './my-reviews.component.css'
})
export class MyReviewsComponent implements OnInit {
  reviews: Review[] = [];
  loading = true;
  message = '';
  messageType = 'info';

  // Edit state
  editingReviewId: string | null = null;
  editRating = 5;
  editComment = '';
  hoverRating = 0;
  saving = false;

  constructor(private reviewService: ReviewService) {}

  ngOnInit(): void {
    this.loadReviews();
  }

  loadReviews(): void {
    this.loading = true;
    this.reviewService.getMyReviews().subscribe({
      next: (data) => {
        this.reviews = data;
        this.loading = false;
      },
      error: (err) => {
        this.showMessage('Failed to load your reviews', 'error');
        this.loading = false;
      }
    });
  }

  startEdit(review: Review): void {
    this.editingReviewId = review._id;
    this.editRating = review.rating;
    this.editComment = review.comment;
    this.hoverRating = 0;
  }

  cancelEdit(): void {
    this.editingReviewId = null;
    this.editComment = '';
  }

  saveEdit(reviewId: string): void {
    if (!this.editComment.trim()) {
      this.showMessage('Review comment cannot be empty', 'error');
      return;
    }

    this.saving = true;
    this.reviewService.updateReview(reviewId, {
      rating: this.editRating,
      comment: this.editComment
    }).subscribe({
      next: (updated) => {
        const index = this.reviews.findIndex(r => r._id === reviewId);
        if (index !== -1) {
          this.reviews[index].rating = updated.rating;
          this.reviews[index].comment = updated.comment;
          this.reviews[index].updatedAt = updated.updatedAt;
        }
        this.editingReviewId = null;
        this.saving = false;
        this.showMessage('Review updated successfully!', 'success');
      },
      error: (err) => {
        this.saving = false;
        this.showMessage(err.error?.message || 'Failed to update review', 'error');
      }
    });
  }

  deleteReview(reviewId: string): void {
    if (!confirm('Are you sure you want to delete this review?')) return;

    this.reviewService.deleteReview(reviewId).subscribe({
      next: () => {
        this.reviews = this.reviews.filter(r => r._id !== reviewId);
        this.showMessage('Review deleted', 'success');
      },
      error: (err) => {
        this.showMessage('Failed to delete review', 'error');
      }
    });
  }

  setHoverRating(val: number): void {
    this.hoverRating = val;
  }

  showMessage(msg: string, type: 'success' | 'error' | 'info'): void {
    this.message = msg;
    this.messageType = type;
    setTimeout(() => {
      this.message = '';
    }, 4000);
  }
}
