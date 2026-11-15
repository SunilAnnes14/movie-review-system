import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

const page = (loader: () => Promise<any>, name: string) => () => loader().then(m => m[name]);

export const routes: Routes = [
  // ----- CineVault 1.0 (preserved)
  { path: '', loadComponent: page(() => import('./pages/home/home.component'), 'HomeComponent') },
  { path: 'movies', loadComponent: page(() => import('./pages/movies/movies.component'), 'MoviesComponent') },
  { path: 'movies/:id', loadComponent: page(() => import('./pages/movie-details/movie-details.component'), 'MovieDetailsComponent') },
  { path: 'login', loadComponent: page(() => import('./pages/login/login.component'), 'LoginComponent') },
  { path: 'register', loadComponent: page(() => import('./pages/register/register.component'), 'RegisterComponent') },
  { path: 'profile', loadComponent: page(() => import('./pages/profile/profile.component'), 'ProfileComponent'), canActivate: [authGuard] },
  { path: 'watchlist', redirectTo: 'vault' },
  { path: 'my-reviews', loadComponent: page(() => import('./pages/my-reviews/my-reviews.component'), 'MyReviewsComponent'), canActivate: [authGuard] },
  { path: 'admin', loadComponent: page(() => import('./pages/admin-dashboard/admin-dashboard.component'), 'AdminDashboardComponent'), canActivate: [adminGuard] },
  { path: 'admin/add-movie', loadComponent: page(() => import('./pages/add-movie/add-movie.component'), 'AddMovieComponent'), canActivate: [adminGuard] },
  { path: 'admin/edit-movie/:id', loadComponent: page(() => import('./pages/edit-movie/edit-movie.component'), 'EditMovieComponent'), canActivate: [adminGuard] },

  // ----- MoviQ
  { path: 'welcome', loadComponent: page(() => import('./pages/onboarding/onboarding.component'), 'OnboardingComponent'), canActivate: [authGuard] },
  { path: 'discover', loadComponent: page(() => import('./pages/discover/discover.component'), 'DiscoverComponent') },
  { path: 'vault', loadComponent: page(() => import('./pages/vault/vault.component'), 'VaultComponent'), canActivate: [authGuard] },
  { path: 'feed', loadComponent: page(() => import('./pages/feed/feed.component'), 'FeedComponent'), canActivate: [authGuard] },
  { path: 'circles', loadComponent: page(() => import('./pages/circles/circles.component'), 'CirclesComponent'), canActivate: [authGuard] },
  { path: 'circles/:id', loadComponent: page(() => import('./pages/circle-detail/circle-detail.component'), 'CircleDetailComponent'), canActivate: [authGuard] },
  { path: 'chat', loadComponent: page(() => import('./pages/chat/chat.component'), 'ChatComponent'), canActivate: [authGuard] },
  { path: 'chat/:id', loadComponent: page(() => import('./pages/chat/chat.component'), 'ChatComponent'), canActivate: [authGuard] },
  { path: 'polls', loadComponent: page(() => import('./pages/polls/polls.component'), 'PollsComponent'), canActivate: [authGuard] },
  { path: 'events', loadComponent: page(() => import('./pages/events/events.component'), 'EventsComponent'), canActivate: [authGuard] },
  { path: 'events/:id', loadComponent: page(() => import('./pages/event-detail/event-detail.component'), 'EventDetailComponent'), canActivate: [authGuard] },
  { path: 'ai', loadComponent: page(() => import('./pages/ai-studio/ai-studio.component'), 'AiStudioComponent'), canActivate: [authGuard] },
  { path: 'people', loadComponent: page(() => import('./pages/people/people.component'), 'PeopleComponent'), canActivate: [authGuard] },
  { path: 'u/:id', loadComponent: page(() => import('./pages/user-profile/user-profile.component'), 'UserProfileComponent'), canActivate: [authGuard] },

  { path: '**', loadComponent: page(() => import('./pages/not-found/not-found.component'), 'NotFoundComponent') }
];
