# MoviQ — Requirements Traceability

This maps every requirement in the MoviQ brief to where it is implemented and how it was verified.

**Verification sources**
- **API** — `backend/test/api.smoke.mjs` (1.0 regression, 51 checks) and `backend/test/v2.smoke.mjs` (2.0 end-to-end, 116 checks, including real Socket.IO clients).
- **Integration** — `backend/test/integration.mock.mjs` (36 checks). It starts contract mocks of the Anthropic Messages API and TMDB that validate every request our backend sends, plus a separate backend instance with keys configured, and drives every LLM and TMDB code path. `npm test` runs all three suites.
- **Browser sweep** — every route opened in headless Chrome as user, admin and guest, at 1440px and 390px (94 page visits). Fails on page errors, failed requests or horizontal overflow.
- **Browser flows** — scripted clicks through the real UI: chat send, poll vote, Group CineMatch, CinePulse, CineBot, Review Intelligence, avatar upload, share to chat.

Final run (2026-11-15): **51/51 + 116/116 API checks + 36/36 integration checks passed · 94/94 page visits clean · all browser flows passed · production build clean.**

---

## 2. Preserve existing functionality
| Requirement | Implementation | Verified by |
|---|---|---|
| Movie search | `controllers/movieController.js` (search input now regex-escaped) | API: *search filter works* |
| Movie details | `pages/movie-details` (extended, not replaced) | Sweep, API: *single movie lookup* |
| Add movies | Admin CRUD (unchanged) + TMDB import for any user (`POST /movies/import/:tmdbId`) | API: *admin can create/update/delete a movie* |
| Personal watchlist | `/api/watchlist` unchanged; `/watchlist` route redirects to `/vault` | API: 7 watchlist checks |
| Watched / Watching / Want to Watch | `models/Watchlist.js` `status`, `PUT /watchlist/:movieId` | API: *add to vault with status*, *vault filters by status* |
| Ratings & reviews | `reviewController.js` (one per user per movie, edit/delete, aggregates) | API: 12 review checks |
| User profiles | `pages/profile` + new public `/u/:id` | API: *profile returns current user*, *profile shows relationship* |
| Movie collections | `models/Collection.js`, `routes/collectionRoutes.js`, Vault → Collections | API: *collection created*, *others cannot modify a collection* |

## 3. Social features
| Requirement | Implementation | Verified by |
|---|---|---|
| A. Search users, friend requests (send, accept, reject), remove, follow, friends' profiles, libraries, ratings, online status | `routes/socialRoutes.js`, `realtime/socket.js` presence, `pages/people`, `pages/user-profile` | API: Friends & follows (8), Privacy (3) |
| B. CineCircle: public/private, join, invite friends, description, cover image, feed, members, chat, polls, events, shared watchlist | `routes/circleRoutes.js`, `pages/circle-detail` (8 tabs), image upload | API: CineCircle (7); Sweep: all 8 circle tabs |
| C. CineChat: 1:1 and group, reactions, replies, typing, online status, timestamps, movie cards, share reviews and recommendations, spoiler-protected, unread, persistence | `services/chat.js`, `routes/chatRoutes.js`, `components/chat-window`, `components/share-to-chat` | API: CineChat (16) + *review shared into chat*; Flows: chat send, share to chat |
| D. CinePoll: create, movie search with posters, expiry, single/multiple choice, live results, no duplicate votes, totals, finalise winner, notify on close | `models/Poll.js` + `PollVote` (unique index), `routes/pollRoutes.js`, `jobs/scheduler.js` (expiry) | API: CinePoll (13); Flow: poll vote |
| E. CinePlan: from poll, movie, date/time, venue, description, invites, RSVP, alternative dates, availability, reminders, booking links, link to poll | `models/MovieEvent.js`, `routes/eventRoutes.js`, scheduler (24h/1h reminders) | API: CinePlan (10) |
| F. CineFeed: reviews, recommendations, watchlist updates, posts, likes, comments, follows, friends' activity, community activity | `models/Post.js`, `routes/feedRoutes.js`, `components/post-card` | API: CineFeed (9) |
| G. CineDiscover: trending, friends' recent watches, popular reviews, most discussed, popular polls, recommended, similar enthusiasts, popular circles | `routes/discoverRoutes.js`, `pages/discover` | API: *social discovery*, *trending* |

## 4. The six AI features
| Requirement | Implementation | Verified by |
|---|---|---|
| CineMatch: content-based, collaborative filtering, genre and metadata similarity, preference scoring, cold-start onboarding | `ai/cinematch.js`, `pages/onboarding` | API: *ranked, explained recommendations*, *excludes vault*, *genre filter* |
| Group CineMatch: group compatibility, per-member scores, matching genres, reasons, broad appeal, not a plain average | `recommendForCircle` (mean + least-misery + disagreement penalty) | API: *Group CineMatch with member compatibility*, *requires membership*; Flow |
| CineSense: genres, directors, actors, decades, styles, average rating, most watched, personality, monthly insights, regenerate | `ai/cinesense.js`, AI Studio → CineSense | API: *Movie DNA generated* |
| Review Intelligence: grammar, readability, summary, sentiment, themes, acting / cinematography / screenplay analysis, spoilers, caption, 5 rewrite styles, user approval required | `ai/reviewIntel.js`, `components/review-assistant` | API: *Review Intelligence analysis*; Flow: analyse → apply |
| CineSpoiler: sentence-level detection, warnings, hide / click-to-reveal, movie-specific protection, user preference, mentions are not spoilers | `ai/cinespoiler.js`, `shared/spoiler-text` | API: *sentence-level detection*, *auto-flagged*, *opinion not flagged* |
| CineBot: recommendations, explanations, director, mood, circle, retrieval before claims, poster cards, follow-ups, watchlist, spoiler-free default | `ai/cinebot.js`, AI Studio → CineBot | API: 4 CineBot checks; Flow: ask |
| CinePulse: polls, votes, feedback, genre trends, voting stats, charts, popular movies, compatibility, next category, no guarantees | `ai/cinepulse.js`, `components/pulse` | API: *CinePulse group analytics*; Flow |

## 5–7. Architecture, TMDB, database
| Requirement | Implementation | Verified by |
|---|---|---|
| Modular AI services behind the API | `backend/ai/*` behind `/api/ai/*` | Code structure |
| Fallback when there is no AI key; no faked results | Local algorithms; LLM-only rewrite returns 503 with instructions | API: *rewrite requires LLM (clear 503)* |
| TMDB with env credentials, caching, error handling, attribution | `services/tmdb.js` (in-memory TTL cache), footer attribution | API: *TMDB endpoints degrade gracefully* |
| Collections, relationships, indexes, validation, access control | 22 collections (see README *Database structure*) | API: every access-control check |

## 8–10. UI/UX, user journey, security
| Requirement | Implementation | Verified by |
|---|---|---|
| Dark cinematic theme with gold, responsive sidebar, the 10 navigation items, AI Studio with 6 tools | `app.html/css`, `styles/v2.css` | Sweep at 1440px and 390px |
| Loading, empty, error states and notifications | Skeletons, `.state`, `.error-box`, toasts, live notification panel | Sweep, screenshots |
| The 13-step journey | Onboarding → vault → reviews → friends → circle → chat → poll → Group CineMatch → event from poll → feedback → CinePulse | API suite runs the journey end to end |
| Auth, hashing, validation, authorisation, rate limits, file handling, env vars, private groups, message privacy, AI key protection, AI consent controls | bcrypt, JWT (REST and socket), helmet, rate limits, `utils/access.js`, `routes/uploadRoutes.js`, privacy toggles | API: privacy, access and upload checks |

---

## Not verified, or implemented differently than literally specified
- **LLM and TMDB code paths are verified against contract mocks, not the live services.** No real credentials exist on this machine, and live Anthropic calls cost money. The integration suite exercises every path end to end: TMDB search, trending, genre, details and import mapping; CineBot's tool loop; structured outputs for rewrites, spoiler verification and CineSense; refusal (422), rate limit with SDK retries (503) and local fallback. It also asserts that all 12 LLM requests meet the API contract. **Not proven:** that the real services accept your particular keys. Add `ANTHROPIC_API_KEY` and `TMDB_READ_TOKEN` to `backend/.env`, restart the backend, then run `npm run test:live` (backend/test/live.check.mjs) to confirm against the real services. While building this suite I found that the installed SDK (v1.8) sends API keys as `Authorization: Bearer`, not `x-api-key`; our code is unaffected because it uses the SDK.
- **Python was optional and not chosen.** The brief says *"If using Python: FastAPI… Scikit-learn…"*, so it is conditional. The AI services are Node modules inside the existing Express backend, which keeps one runtime and one deployment. The required capabilities (content-based and collaborative filtering, NLP classification, analytics, an LLM assistant) are all implemented and tested.
- **Some listed collections are embedded instead of separate:** `poll_options` (inside `polls`), `event_attendees` (inside `movieevents`), `likes` (inside `posts`), `user_preferences` (inside `users`), `user_movies` (= `watchlists`). Votes are a separate collection so uniqueness is enforced by the database.
- **Posters:** movies added without TMDB have no artwork, so the app draws a typographic poster. Two original seed poster links (The Godfather, The Matrix) were dead and were cleared.
- **External ratings were not copied.** The new IMDb-top and Tamil titles start with no MoviQ rating; IMDb's scores are not MoviQ ratings.
