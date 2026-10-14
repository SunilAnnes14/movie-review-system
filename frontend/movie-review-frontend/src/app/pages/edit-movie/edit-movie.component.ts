import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MovieService } from '../../services/movie.service';
import { Movie } from '../../models/movie.model';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-edit-movie',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './edit-movie.component.html',
  styleUrl: './edit-movie.component.css'
})
export class EditMovieComponent implements OnInit {
  movieId = '';
  movie: Movie | null = null;
  movieForm: FormGroup;
  loading = true;
  saving = false;
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
    private route: ActivatedRoute,
    private router: Router,
    private movieService: MovieService
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

  ngOnInit(): void {
    this.movieId = this.route.snapshot.paramMap.get('id') || '';
    if (this.movieId) {
      this.loadMovie();
    } else {
      this.error = 'Invalid Movie ID';
      this.loading = false;
    }
  }

  loadMovie(): void {
    this.loading = true;
    this.movieService.getMovie(this.movieId).subscribe({
      next: (m) => {
        this.movie = m;
        this.selectedGenres = [...m.genre];
        this.movieForm.patchValue({
          title: m.title,
          director: m.director,
          releaseYear: m.releaseYear,
          duration: m.duration,
          description: m.description,
          poster: m.poster,
          backdrop: m.backdrop || '',
          trailer: m.trailer || '',
          cast: m.cast ? m.cast.join(', ') : ''
        });
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load movie details';
        this.loading = false;
      }
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

    this.saving = true;
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

    this.movieService.updateMovie(this.movieId, moviePayload).subscribe({
      next: (updated) => {
        this.saving = false;
        this.success = 'Movie updated successfully!';
        setTimeout(() => {
          this.router.navigate(['/movies', this.movieId]);
        }, 1200);
      },
      error: (err) => {
        this.saving = false;
        this.error = err.error?.message || 'Failed to update movie.';
      }
    });
  }
}
