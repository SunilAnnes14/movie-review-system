import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URL } from '../config';

/**
 * Typed-enough client for the CineVault 2.0 endpoints
 * (social graph, collections, circles, chat, polls, events, feed, discovery, notifications, TMDB, AI).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private u = API_URL;
  constructor(private http: HttpClient) {}

  private get<T = any>(path: string, params: Record<string, any> = {}): Observable<T> {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') clean[k] = String(v);
    return this.http.get<T>(this.u + path, { params: clean });
  }
  private post<T = any>(path: string, body: any = {}): Observable<T> { return this.http.post<T>(this.u + path, body); }
  private put<T = any>(path: string, body: any = {}): Observable<T> { return this.http.put<T>(this.u + path, body); }
  private del<T = any>(path: string): Observable<T> { return this.http.delete<T>(this.u + path); }

  // ---------- People & friends
  searchUsers(q: string) { return this.get<any[]>('/social/users/search', { q }); }
  user(id: string) { return this.get('/social/users/' + id); }
  userLibrary(id: string, status?: string) { return this.get<any[]>(`/social/users/${id}/library`, { status }); }
  userReviews(id: string) { return this.get<any[]>(`/social/users/${id}/reviews`); }
  userCollections(id: string) { return this.get<any[]>(`/social/users/${id}/collections`); }
  friends() { return this.get<any[]>('/social/friends'); }
  friendRequests() { return this.get<{ incoming: any[]; outgoing: any[] }>('/social/friends/requests'); }
  sendFriendRequest(userId: string) { return this.post('/social/friends/' + userId); }
  respondFriendRequest(id: string, action: 'accept' | 'reject') { return this.post(`/social/friends/requests/${id}/${action}`); }
  removeFriend(userId: string) { return this.del('/social/friends/' + userId); }
  follow(userId: string) { return this.post('/social/follow/' + userId); }
  unfollow(userId: string) { return this.del('/social/follow/' + userId); }

  // ---------- Collections
  myCollections() { return this.get<any[]>('/collections'); }
  collection(id: string) { return this.get('/collections/' + id); }
  createCollection(body: any) { return this.post('/collections', body); }
  updateCollection(id: string, body: any) { return this.put('/collections/' + id, body); }
  deleteCollection(id: string) { return this.del('/collections/' + id); }
  addToCollection(id: string, movieId: string) { return this.post(`/collections/${id}/movies/${movieId}`); }
  removeFromCollection(id: string, movieId: string) { return this.del(`/collections/${id}/movies/${movieId}`); }

  // ---------- Circles
  myCircles() { return this.get<any[]>('/circles'); }
  discoverCircles(q?: string) { return this.get<any[]>('/circles/discover', { q }); }
  circle(id: string) { return this.get('/circles/' + id); }
  createCircle(body: any) { return this.post('/circles', body); }
  updateCircle(id: string, body: any) { return this.put('/circles/' + id, body); }
  deleteCircle(id: string) { return this.del('/circles/' + id); }
  joinCircle(id: string) { return this.post(`/circles/${id}/join`); }
  declineCircle(id: string) { return this.post(`/circles/${id}/decline`); }
  leaveCircle(id: string) { return this.post(`/circles/${id}/leave`); }
  inviteToCircle(id: string, userIds: string[]) { return this.post(`/circles/${id}/invite`, { userIds }); }
  circleMembers(id: string) { return this.get<any[]>(`/circles/${id}/members`); }
  setMemberRole(id: string, userId: string, role: string) { return this.put(`/circles/${id}/members/${userId}`, { role }); }
  removeMember(id: string, userId: string) { return this.del(`/circles/${id}/members/${userId}`); }
  addCircleWatchlist(id: string, movieId: string) { return this.post(`/circles/${id}/watchlist/${movieId}`); }
  removeCircleWatchlist(id: string, movieId: string) { return this.del(`/circles/${id}/watchlist/${movieId}`); }

  // ---------- Chat
  conversations() { return this.get<any[]>('/chat/conversations'); }
  unreadMessages() { return this.get<{ unread: number }>('/chat/unread'); }
  startDirect(userId: string) { return this.post<{ _id: string }>('/chat/direct/' + userId); }
  messages(convId: string, before?: string) { return this.get<{ messages: any[]; hasMore: boolean }>(`/chat/conversations/${convId}/messages`, { before }); }
  sendMessage(convId: string, body: any) { return this.post(`/chat/conversations/${convId}/messages`, body); }
  react(messageId: string, emoji: string) { return this.post(`/chat/messages/${messageId}/react`, { emoji }); }
  markRead(convId: string) { return this.post(`/chat/conversations/${convId}/read`); }

  // ---------- Polls
  polls(params: { circle?: string; status?: string } = {}) { return this.get<any[]>('/polls', params); }
  poll(id: string) { return this.get('/polls/' + id); }
  createPoll(body: any) { return this.post('/polls', body); }
  vote(id: string, optionIds: string[]) { return this.post(`/polls/${id}/vote`, { optionIds }); }
  clearVote(id: string) { return this.del(`/polls/${id}/vote`); }
  closePoll(id: string) { return this.post(`/polls/${id}/close`); }
  deletePoll(id: string) { return this.del('/polls/' + id); }

  // ---------- Events
  events(params: { circle?: string; when?: string } = {}) { return this.get<any[]>('/events', params); }
  event(id: string) { return this.get('/events/' + id); }
  createEvent(body: any) { return this.post('/events', body); }
  updateEvent(id: string, body: any) { return this.put('/events/' + id, body); }
  deleteEvent(id: string) { return this.del('/events/' + id); }
  rsvp(id: string, rsvp: string) { return this.post(`/events/${id}/rsvp`, { rsvp }); }
  proposeDate(id: string, startsAt: string) { return this.post(`/events/${id}/proposals`, { startsAt }); }
  toggleAvailability(id: string, proposalId: string) { return this.post(`/events/${id}/proposals/${proposalId}/availability`); }
  adoptProposal(id: string, proposalId: string) { return this.post(`/events/${id}/proposals/${proposalId}/adopt`); }
  eventFeedback(id: string, rating: number, comment: string) { return this.post(`/events/${id}/feedback`, { rating, comment }); }

  // ---------- Feed
  feed(params: { tab?: string; circle?: string; before?: string } = {}) { return this.get<{ posts: any[]; hasMore: boolean }>('/feed', params); }
  createPost(body: any) { return this.post('/feed', body); }
  deletePost(id: string) { return this.del('/feed/' + id); }
  likePost(id: string) { return this.post<{ liked: boolean; likeCount: number }>(`/feed/${id}/like`); }
  comments(id: string) { return this.get<any[]>(`/feed/${id}/comments`); }
  addComment(id: string, text: string, isSpoiler?: boolean) { return this.post(`/feed/${id}/comments`, { text, isSpoiler }); }

  // ---------- Discover / TMDB
  discover() { return this.get('/discover'); }
  trending() { return this.get<{ source: string; items: any[] }>('/discover/trending'); }
  tmdbStatus() { return this.get<{ configured: boolean }>('/tmdb/status'); }
  tmdbSearch(q: string, page = 1) { return this.get<{ results: any[]; page: number; totalPages: number }>('/tmdb/search', { q, page }); }
  tmdbGenre(genre: string) { return this.get<any[]>('/tmdb/genre/' + encodeURIComponent(genre)); }
  importMovie(tmdbId: number) { return this.post('/movies/import/' + tmdbId); }
  similarMovies(id: string) { return this.get<any[]>(`/movies/${id}/similar`); }

  // ---------- Notifications
  notifications() { return this.get<{ items: any[]; unread: number }>('/notifications'); }
  readNotification(id: string) { return this.post(`/notifications/${id}/read`); }
  readAllNotifications() { return this.post('/notifications/read-all'); }

  // ---------- Uploads
  uploadImage(file: File) { const fd = new FormData(); fd.append('image', file); return this.http.post<{ url: string }>(this.u + '/uploads/image', fd); }

  // ---------- AI
  aiStatus() { return this.get('/ai/status'); }
  cinematch(params: { genre?: string; seed?: string; limit?: number } = {}) { return this.get('/ai/cinematch', params); }
  groupMatch(circleId: string, members?: string[]) { return this.get(`/ai/cinematch/circle/${circleId}`, { members: members?.join(',') }); }
  cinesense() { return this.get('/ai/cinesense'); }
  regenerateCinesense() { return this.post('/ai/cinesense/regenerate'); }
  analyzeReview(text: string, movieId?: string, rating?: number) { return this.post('/ai/review/analyze', { text, movieId, rating }); }
  rewriteReview(text: string, style: string, movieId?: string, rating?: number) { return this.post('/ai/review/rewrite', { text, style, movieId, rating }); }
  acceptAiSuggestion(historyId: string) { return this.post(`/ai/review/history/${historyId}/accept`); }
  aiReviewHistory() { return this.get<any[]>('/ai/review/history'); }
  detectSpoilers(text: string, movieId?: string) { return this.post('/ai/spoiler/detect', { text, movieId }); }
  botChat(message: string, history: any[], spoilerFree: boolean) { return this.post('/ai/bot/chat', { message, history, spoilerFree }); }
  pulse(circleId: string) { return this.get('/ai/pulse/' + circleId); }
}
