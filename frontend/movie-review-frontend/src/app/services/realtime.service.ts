import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, filter, map } from 'rxjs';
import { SOCKET_URL } from '../config';
import { AuthService } from './auth.service';

interface ServerEvent { event: string; payload: any; }

/**
 * Single authenticated Socket.IO connection for the signed-in user.
 * Connects on login, disconnects on logout, and re-joins rooms after reconnects.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket: Socket | null = null;
  private events$ = new Subject<ServerEvent>();
  private rooms = new Map<string, string>(); // key -> event name used to join
  readonly onlineUsers = new Set<string>();
  connected = false;

  private static EVENTS = ['message:new', 'message:reaction', 'conversation:read', 'typing', 'presence', 'notification', 'poll:update', 'event:update', 'circle:watchlist'];

  constructor(private auth: AuthService, private zone: NgZone) {
    this.auth.currentUser$.subscribe(user => (user ? this.connect() : this.disconnect()));
  }

  private connect(): void {
    if (this.socket || !this.auth.token) return;
    this.socket = io(SOCKET_URL, { auth: { token: this.auth.token }, transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => this.zone.run(() => {
      this.connected = true;
      for (const [id, ev] of this.rooms) this.socket?.emit(ev, id);
    }));
    this.socket.on('disconnect', () => this.zone.run(() => (this.connected = false)));
    for (const ev of RealtimeService.EVENTS) {
      this.socket.on(ev, (payload: any) => this.zone.run(() => {
        if (ev === 'presence') payload.online ? this.onlineUsers.add(payload.userId) : this.onlineUsers.delete(payload.userId);
        this.events$.next({ event: ev, payload });
      }));
    }
  }

  private disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.rooms.clear();
  }

  on<T = any>(event: string): Observable<T> {
    return this.events$.pipe(filter(e => e.event === event), map(e => e.payload as T));
  }

  joinConversation(id: string): void { this.rooms.set(id, 'conversation:join'); this.socket?.emit('conversation:join', id); }
  leaveConversation(id: string): void { this.rooms.delete(id); this.socket?.emit('conversation:leave', id); }
  joinCircle(id: string): void { this.rooms.set(id, 'circle:join'); this.socket?.emit('circle:join', id); }
  leaveCircle(id: string): void { this.rooms.delete(id); this.socket?.emit('circle:leave', id); }
  typing(conversationId: string, typing: boolean): void { this.socket?.emit('typing', { conversationId, typing }); }
}
