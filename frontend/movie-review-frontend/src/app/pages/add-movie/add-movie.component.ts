import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MovieService } from '../../services/movie.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-add-movie',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './add-movie.component.html',
  styleUrl: './add-movie.component.css'
})
export class AddMovieComponent {
  movieForm: FormGroup;
  loading = false;
  error = '';
  success = '';

  availableGenres = [
    'Action', 'Adventure', 'Animation', 'Biography', 'Comedy', 'Crime',
    'Drama', 'Family', 'Fantasy', 'Horror', 'Mystery', 'Romance',
    'Sci-Fi', 'Thriller', 'Western'
  ];

  selectedGenres: string[] = [];

  constructor(
    private fb: FormBuilder,
    private movieService: MovieService,
    private router: Router
  ) {
    this.movieForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(100)]],
      director: ['', [Validators.required]],
      releaseYear: [new Date().getFullYear(), [Validators.required, Validators.min(1888), Validators.max(2100)]],
      duration: [120, [Validators.required, Validators.min(1)]],
      description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
      poster: ['', [Validators.required]],
      backdrop: [''],
      trailer: [''],
      cast: ['']
    });
  }

  toggleGenre(genre: string): void {
    if (this.selectedGenres.includes(genre)) {
      this.selectedGenres = this.selectedGenres.filter(g => g !== genre);
    } else {
      this.selectedGenres.push(genre);
    }
  }

  onSubmit(): void {
    if (this.movieForm.invalid) {
      this.movieForm.markAllAsTouched();
      return;
    }

    if (this.selectedGenres.length === 0) {
      this.error = 'Please select at least one genre';
      return;
    }

    this.loading = true;
    this.error = '';

    const formVal = this.movieForm.value;
    const castArray = formVal.cast
      ? formVal.cast.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];

    const moviePayload = {
      title: formVal.title,
      director: formVal.director,
      releaseYear: Number(formVal.releaseYear),
      genre: this.selectedGenres,
      duration: Number(formVal.duration),
      description: formVal.description,
      poster: formVal.poster,
      backdrop: formVal.backdrop || formVal.poster,
      trailer: formVal.trailer || '',
      cast: castArray
    };

    this.movieService.createMovie(moviePayload).subscribe({
      next: (created) => {
        this.loading = false;
        this.success = 'Movie added successfully!';
        setTimeout(() => {
          this.router.navigate(['/movies', created._id]);
        }, 1200);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Failed to add movie. Please try again.';
      }
    });
  }
}
