import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { PrivacySettings } from '../../models/user.model';
import { AvatarComponent } from '../../shared/avatar.component';
import { ImageUploadComponent } from '../../shared/image-upload.component';

/** Bio/avatar, taste preferences and privacy & AI-data controls. */
@Component({
  changeDetection: ChangeDetectionStrategy.Default,
  selector: 'app-profile-settings',
  standalone: true,
  imports: [RouterLink, FormsModule, AvatarComponent, ImageUploadComponent],
  template: `
  <div class="grid-2 mt-3" id="privacy">
    <div class="panel">
      <h3>Public profile</h3>
      <div class="row mb-2">
        <cv-avatar [user]="{ name: auth.currentUser?.name, avatar: avatar }" size="lg" />
        <a class="link text-sm" [routerLink]="['/u', auth.currentUser?._id]">View as others see it →</a>
      </div>
      <div class="form-group"><label class="form-label">Avatar</label><div class="input-row"><input class="form-input" [(ngModel)]="avatar" placeholder="https://… or upload" /><cv-image-upload label="Upload" (uploaded)="avatar = $event; save()" /></div></div>
      <div class="form-group"><label class="form-label">Bio</label><textarea class="form-textarea" rows="3" maxlength="300" [(ngModel)]="bio" placeholder="Nolan devotee. Will watch anything with a twist."></textarea></div>
      <div class="row between">
        <span class="text-xs text-muted">Genres: {{ (auth.currentUser?.favoriteGenres || []).join(', ') || 'not set' }}</span>
        <a routerLink="/welcome" class="link text-sm">Edit taste picks</a>
      </div>
      <button class="btn btn-primary btn-sm mt-2" (click)="save()">Save profile</button>
    </div>

    <div class="panel">
      <h3>🔒 Privacy & AI data</h3>
      <div class="form-group">
        <label class="form-label">Who can see my profile</label>
        <select class="form-select" [(ngModel)]="privacy.profileVisibility" (ngModelChange)="savePrivacy()">
          <option value="public">Everyone</option><option value="friends">Friends only</option><option value="private">Only me</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Who can see my library, reviews & watch activity</label>
        <select class="form-select" [(ngModel)]="privacy.libraryVisibility" (ngModelChange)="savePrivacy()">
          <option value="public">Everyone</option><option value="friends">Friends only</option><option value="private">Only me</option>
        </select>
      </div>
      <div class="stack" style="gap:14px">
        <label class="switch"><input type="checkbox" [(ngModel)]="privacy.allowHistoryForAI" (ngModelChange)="savePrivacy()" />
          <span><strong>Use my viewing history for recommendations</strong><span class="d-block text-xs text-muted">CineMatch, CineSense, CineBot and group features. When off, only your stated preferences are used and you're excluded from collaborative filtering.</span></span></label>
        <label class="switch"><input type="checkbox" [(ngModel)]="privacy.allowReviewsForAI" (ngModelChange)="savePrivacy()" />
          <span><strong>Use my review text for Movie DNA</strong><span class="d-block text-xs text-muted">Review wording helps detect your storytelling preferences. Only aggregated statistics are ever sent to an AI model.</span></span></label>
        <label class="switch"><input type="checkbox" [(ngModel)]="privacy.spoilerShield" (ngModelChange)="savePrivacy()" />
          <span><strong>Spoiler shield</strong><span class="d-block text-xs text-muted">Hide content CineSpoiler flags, except for movies you've already watched.</span></span></label>
      </div>
    </div>
  </div>
  `,
  styles: [`.d-block { display: block; margin-top: 2px; font-weight: 400; } .switch { align-items: flex-start; }`]
})
export class ProfileSettingsComponent implements OnInit {
  bio = '';
  avatar = '';
  privacy: PrivacySettings = { profileVisibility: 'public', libraryVisibility: 'friends', allowHistoryForAI: true, allowReviewsForAI: true, spoilerShield: true };

  constructor(public auth: AuthService, private toast: ToastService) {}

  ngOnInit(): void {
    const u = this.auth.currentUser;
    this.bio = u?.bio || '';
    this.avatar = u?.avatar || '';
    if (u?.privacy) this.privacy = { ...this.privacy, ...u.privacy };
    setTimeout(() => { if (location.search.includes('tab=privacy')) document.getElementById('privacy')?.scrollIntoView({ behavior: 'smooth' }); }, 300);
  }

  save(): void {
    this.auth.updatePreferences({ bio: this.bio, avatar: this.avatar.trim() }).subscribe({ next: () => this.toast.success('Profile saved'), error: e => this.toast.error(e) });
  }
  savePrivacy(): void {
    this.auth.updatePreferences({ privacy: this.privacy }).subscribe({ next: () => this.toast.success('Privacy settings saved'), error: e => this.toast.error(e) });
  }
}
