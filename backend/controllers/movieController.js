const Movie = require('../models/Movie');
const Review = require('../models/Review');
const Watchlist = require('../models/Watchlist');

// @desc    Get all movies with filtering, sorting, search
// @route   GET /api/movies
// @access  Public
const getMovies = async (req, res, next) => {
  try {
    const { search, genre, year, minRating, sort, page = 1, limit = 12 } = req.query;
    let query = {};

    // Search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { director: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Genre filter
    if (genre) {
      query.genre = { $in: genre.split(',') };
    }

    // Year filter
    if (year) {
      query.releaseYear = parseInt(year);
    }

    // Rating filter
    if (minRating) {
      query.averageRating = { $gte: parseFloat(minRating) };
    }

    // Sort
    let sortOption = { createdAt: -1 };
    switch (sort) {
      case 'oldest':
        sortOption = { createdAt: 1 };
        break;
      case 'rating':
        sortOption = { averageRating: -1 };
        break;
      case 'reviews':
        sortOption = { reviewCount: -1 };
        break;
      case 'year':
        sortOption = { releaseYear: -1 };
        break;
      case 'title':
        sortOption = { title: 1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Movie.countDocuments(query);
    const movies = await Movie.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      movies,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single movie by ID
// @route   GET /api/movies/:id
// @access  Public
const getMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }
    res.json(movie);
  } catch (error) {
    next(error);
  }
};

// @desc    Create a movie
// @route   POST /api/movies
// @access  Private/Admin
const createMovie = async (req, res, next) => {
  try {
    const { title, description, genre, releaseYear, director, cast, poster, backdrop, trailer, duration } = req.body;

    const movie = await Movie.create({
      title,
      description,
      genre: Array.isArray(genre) ? genre : [genre],
      releaseYear,
      director,
      cast: Array.isArray(cast) ? cast : cast ? cast.split(',').map(c => c.trim()) : [],
      poster: poster || '',
      backdrop: backdrop || '',
      trailer: trailer || '',
      duration: duration ? Number(duration) : 120
    });

    res.status(201).json(movie);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a movie
// @route   PUT /api/movies/:id
// @access  Private/Admin
const updateMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    const { title, description, genre, releaseYear, director, cast, poster, backdrop, trailer, duration } = req.body;

    movie.title = title || movie.title;
    movie.description = description || movie.description;
    movie.genre = genre ? (Array.isArray(genre) ? genre : [genre]) : movie.genre;
    movie.releaseYear = releaseYear || movie.releaseYear;
    movie.director = director || movie.director;
    movie.cast = cast ? (Array.isArray(cast) ? cast : cast.split(',').map(c => c.trim())) : movie.cast;
    movie.poster = poster !== undefined ? poster : movie.poster;
    movie.backdrop = backdrop !== undefined ? backdrop : movie.backdrop;
    movie.trailer = trailer !== undefined ? trailer : movie.trailer;
    movie.duration = duration !== undefined ? Number(duration) : movie.duration;

    const updatedMovie = await movie.save();
    res.json(updatedMovie);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a movie
// @route   DELETE /api/movies/:id
// @access  Private/Admin
const deleteMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      return res.status(404).json({ message: 'Movie not found' });
    }

    // Delete associated reviews and watchlist entries
    await Review.deleteMany({ movieId: movie._id });
    await Watchlist.deleteMany({ movieId: movie._id });
    await Movie.findByIdAndDelete(req.params.id);

    res.json({ message: 'Movie deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all unique genres
// @route   GET /api/movies/genres/list
// @access  Public
const getGenres = async (req, res, next) => {
  try {
    const genres = await Movie.distinct('genre');
    res.json(genres.sort());
  } catch (error) {
    next(error);
  }
};

module.exports = { getMovies, getMovie, createMovie, updateMovie, deleteMovie, getGenres };
