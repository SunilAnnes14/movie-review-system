import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  mobileMenuOpen = false;

  constructor(public authService: AuthService, private router: Router) {}

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  logout(): void {
    this.authService.logout();
    this.mobileMenuOpen = false;
    this.router.navigate(['/']);
  }
}
