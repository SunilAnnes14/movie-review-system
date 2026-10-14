# CineVault - Full-Stack Movie Review & Rating System

A modern, responsive, and feature-rich **Movie Review & Rating System** built with **Angular (Standalone & Signals-ready)**, **Node.js**, **Express**, and **MongoDB**.

---

## 🌟 Features

### 🎬 Movies
- **Discover & Browse**: Explore top-rated and trending movies with high-resolution posters and modern card animations.
- **Search & Filters**: Real-time search by title/director/description, filter by genre, and sort by highest rated, newest, or title.
- **Cinematic Detail Page**: Immersive movie backdrops, trailer links, cast listings, duration, synopsis, and rating breakdowns.

### ⭐ Ratings & Reviews
- **Interactive 5-Star Ratings**: Click and hover rating system with instant feedback.
- **User Reviews**: Write detailed reviews and share thoughts with the community.
- **Manage Own Reviews**: Edit or delete your previous reviews directly from the movie page or the dedicated **My Reviews** page.
- **One Review Rule**: Prevents duplicate reviews per user per movie while allowing limitless edits.

### 🔖 Watchlist
- **Save for Later**: Authenticated users can bookmark movies to their personal watchlist with a single click.
- **Watchlist Dashboard**: Easily manage and view your saved watchlist.

### 🔐 Authentication & Roles
- **JWT & bcrypt**: Secure authentication with JSON Web Tokens and salted password hashing.
- **Role-Based Access Control**:
  - **Regular User**: Browse movies, manage watchlist, leave reviews, and update their profile.
  - **Administrator**: Full catalog control (add/edit/delete movies) and community moderation (delete reviews).
- **Route Guards**: `authGuard` and `adminGuard` protecting sensitive routes.
- **HTTP Interceptor**: Automatic injection of `Authorization: Bearer <token>` into all outbound API requests.

### 🛡️ Admin Dashboard
- **Catalog Management**: View the complete movie catalog with live search.
- **Add / Edit Movie**: Comprehensive forms with genre chips, cast input, runtime, poster, and trailer URLs.
- **Review Moderation**: View all platform reviews and remove inappropriate content.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: Angular 19+ (Standalone Components)
- **Language**: TypeScript
- **Styling**: Vanilla CSS (CSS Variables, Glassmorphism, Dark Mode Cinema Theme)
- **Forms**: Angular Reactive Forms & FormsModule
- **Routing & Guards**: Angular Router with lazy loading and functional guards
- **HTTP**: Angular `provideHttpClient` with functional interceptor

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js REST API
- **Database**: MongoDB & Mongoose ORM
- **Security**: JWT (`jsonwebtoken`), `bcryptjs`, `cors`, `dotenv`
- **Error Handling**: Centralized error middleware with standard JSON responses

---

## 📂 Project Structure

```text
movie-review-system/
├── backend/
│   ├── config/
│   │   └── db.js                 # MongoDB connection logic
│   ├── controllers/
│   │   ├── authController.js     # User registration, login, profile
│   │   ├── movieController.js    # CRUD, filtering, genres
│   │   ├── reviewController.js   # Review CRUD & auto-aggregations
│   │   └── watchlistController.js# Add, remove, check watchlist
│   ├── middleware/
│   │   ├── authMiddleware.js     # JWT verification & admin guard
│   │   └── errorHandler.js       # Centralized error handler
│   ├── models/
│   │   ├── Movie.js              # Movie schema & averageRating aggregation
│   │   ├── Review.js             # Review schema with post-save hooks
│   │   ├── User.js               # User schema with bcrypt methods
│   │   └── Watchlist.js          # Watchlist schema
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── movieRoutes.js
│   │   ├── reviewRoutes.js
│   │   ├── userRoutes.js
│   │   └── watchlistRoutes.js
│   ├── .env                      # Environment configuration
│   ├── package.json
│   ├── seed.js                   # Database seed script
│   └── server.js                 # Express entrypoint
│
└── frontend/
    └── movie-review-frontend/
        ├── src/
        │   ├── app/
        │   │   ├── guards/       # authGuard, adminGuard
        │   │   ├── interceptors/ # jwt.interceptor
        │   │   ├── models/       # Movie, Review, User interfaces
        │   │   ├── pages/
        │   │   │   ├── home/
        │   │   │   ├── movies/
        │   │   │   ├── movie-details/
        │   │   │   ├── my-reviews/
        │   │   │   ├── watchlist/
        │   │   │   ├── profile/
        │   │   │   ├── login/
        │   │   │   ├── register/
        │   │   │   ├── admin-dashboard/
        │   │   │   ├── add-movie/
        │   │   │   ├── edit-movie/
        │   │   │   └── not-found/
        │   │   ├── services/     # AuthService, MovieService, ReviewService, WatchlistService
        │   │   ├── app.ts / app.html / app.css
        │   │   ├── app.routes.ts
        │   │   └── app.config.ts
        │   ├── index.html
        │   └── styles.css        # Global CSS variables, reset, design tokens
        └── package.json
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18 or newer
- **MongoDB**: Locally running MongoDB service (`mongodb://localhost:27017`) or MongoDB Atlas URI

---

### 2. Backend Setup
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure `.env` (already created with defaults):
   ```env
   MONGO_URI=mongodb://localhost:27017/movie_review_db
   JWT_SECRET=m0v13_r3v13w_s3cr3t_k3y_2024_pr0duct10n
   PORT=5000
   ```
4. Seed the database with sample movies, users, and reviews:
   ```bash
   node seed.js
   ```
5. Start the backend server:
   ```bash
   npm run dev
   # or
   npm start
   ```
   The backend will be running at `http://localhost:5000`.

---

### 3. Frontend Setup
1. Open a second terminal and navigate to the frontend folder:
   ```bash
   cd frontend/movie-review-frontend
   ```
2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```
3. Start the Angular development server:
   ```bash
   npm start
   # or
   ng serve
   ```
4. Open your browser and navigate to:
   ```
   http://localhost:4200
   ```

---

## 🔑 Demo Credentials

After running `node seed.js`, the following accounts are ready to use:

| Role | Email | Password |
|---|---|---|
| **Administrator** | `admin@moviereview.com` | `admin123` |
| **Standard User** | `john@example.com` | `password123` |

You can also create any number of new user accounts via the **Sign Up** page.

---

## 📡 REST API Summary

### Authentication (`/api/auth`)
- `POST /register`: Register a new account
- `POST /login`: Authenticate and receive a JWT

### Movies (`/api/movies`)
- `GET /`: List movies with search, filter (`genre`, `year`, `minRating`), and pagination
- `GET /genres/list`: List all distinct genres
- `GET /:id`: Get movie details
- `POST /`: Add a new movie *(Admin only)*
- `PUT /:id`: Update movie *(Admin only)*
- `DELETE /:id`: Delete movie *(Admin only)*

### Reviews (`/api/reviews`)
- `GET /movies/:id/reviews`: Get reviews for a movie
- `POST /movies/:id/reviews`: Create a review *(Auth required)*
- `PUT /reviews/:id`: Update review *(Author only)*
- `DELETE /reviews/:id`: Delete review *(Author or Admin)*
- `GET /reviews/my`: Get current user's reviews *(Auth required)*
- `GET /reviews`: List all reviews *(Admin only)*

### Watchlist (`/api/watchlist`)
- `GET /`: Get user's watchlist
- `POST /:movieId`: Add movie to watchlist
- `DELETE /:movieId`: Remove movie from watchlist
- `GET /check/:movieId`: Check if movie is bookmarked
