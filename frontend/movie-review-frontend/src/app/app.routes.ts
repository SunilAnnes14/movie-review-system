import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'movies',
    loadComponent: () => import('./pages/movies/movies.component').then(m => m.MoviesComponent)
  },
  {
    path: 'movies/:id',
    loadComponent: () => import('./pages/movie-details/movie-details.component').then(m => m.MovieDetailsComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'watchlist',
    loadComponent: () => import('./pages/watchlist/watchlist.component').then(m => m.WatchlistComponent),
    canActivate: [authGuard]
  },
  {
    path: 'my-reviews',
    loadComponent: () => import('./pages/my-reviews/my-reviews.component').then(m => m.MyReviewsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'admin/add-movie',
    loadComponent: () => import('./pages/add-movie/add-movie.component').then(m => m.AddMovieComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'admin/edit-movie/:id',
    loadComponent: () => import('./pages/edit-movie/edit-movie.component').then(m => m.EditMovieComponent),
    canActivate: [adminGuard]
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];
