const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Movie = require('./models/Movie');
const Review = require('./models/Review');
const Watchlist = require('./models/Watchlist');

dotenv.config();

const movies = [
  {
    title: 'The Shawshank Redemption',
    description: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency. Andy Dufresne, a banker convicted of murdering his wife and her lover, befriends fellow inmate Red in Shawshank State Penitentiary.',
    genre: ['Drama'],
    releaseYear: 1994,
    director: 'Frank Darabont',
    cast: ['Tim Robbins', 'Morgan Freeman', 'Bob Gunton', 'William Sadler'],
    poster: 'https://m.media-amazon.com/images/M/MV5BMDAyY2FhYjctNDc5OS00MDNlLThiMGUtY2UxYWVkNGY2ZjljXkEyXkFqcGc@._V1_.jpg'
  },
  {
    title: 'The Dark Knight',
    description: 'When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice. A gripping tale of heroism and villainy that redefined the superhero genre.',
    genre: ['Action', 'Drama', 'Thriller'],
    releaseYear: 2008,
    director: 'Christopher Nolan',
    cast: ['Christian Bale', 'Heath Ledger', 'Aaron Eckhart', 'Michael Caine'],
    poster: 'https://m.media-amazon.com/images/M/MV5BMTMxNTMwODM0NF5BMl5BanBnXkFtZTcwODAyMTk2Mw@@._V1_.jpg'
  },
  {
    title: 'Inception',
    description: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a CEO. Dom Cobb leads a team of specialists into layers of dreams within dreams in this mind-bending thriller.',
    genre: ['Action', 'Sci-Fi', 'Thriller'],
    releaseYear: 2010,
    director: 'Christopher Nolan',
    cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page', 'Tom Hardy'],
    poster: 'https://m.media-amazon.com/images/M/MV5BMjAxMzY3NjcxNF5BMl5BanBnXkFtZTcwNTI5OTM0Mw@@._V1_.jpg'
  },
  {
    title: 'Pulp Fiction',
    description: 'The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption. Quentin Tarantino weaves multiple storylines into a darkly comic masterpiece of modern cinema.',
    genre: ['Drama', 'Comedy'],
    releaseYear: 1994,
    director: 'Quentin Tarantino',
    cast: ['John Travolta', 'Uma Thurman', 'Samuel L. Jackson', 'Bruce Willis'],
    poster: 'https://m.media-amazon.com/images/M/MV5BYTViYTE3ZGQtNDBlMC00ZTAyLTkyODMtZGRiZDg0MjA2YThkXkEyXkFqcGc@._V1_.jpg'
  },
  {
    title: 'Interstellar',
    description: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival. Cooper, a former NASA pilot, leaves his family behind to journey through space and time, facing the unknown to save the future of mankind.',
    genre: ['Sci-Fi', 'Drama', 'Adventure'],
    releaseYear: 2014,
    director: 'Christopher Nolan',
    cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain', 'Michael Caine'],
    poster: 'https://m.media-amazon.com/images/M/MV5BYzdjMDAxZGItMjI2My00ODA1LTlkNzItOWFjMDU5ZDJlYWY3XkEyXkFqcGc@._V1_.jpg'
  },
  {
    title: 'The Godfather',
    description: 'The aging patriarch of an organized crime dynasty in postwar New York City transfers control of his clandestine empire to his reluctant youngest son. A saga of power, family loyalty, and the American Dream corrupted by violence.',
    genre: ['Drama', 'Crime'],
    releaseYear: 1972,
    director: 'Francis Ford Coppola',
    cast: ['Marlon Brando', 'Al Pacino', 'James Caan', 'Robert Duvall'],
    poster: 'https://m.media-amazon.com/images/M/MV5BYTJkNGQyZDgtZDQ0NC00MDM0LWEzZWQtYzUzZDEwMDljZWNjXkEyXkFqcGc@._V1_.jpg'
  },
  {
    title: 'Spirited Away',
    description: 'During her family\'s move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches, and spirits, and where humans are changed into beasts. Chihiro must navigate this magical realm to save her parents and find her way home.',
    genre: ['Animation', 'Adventure', 'Drama'],
    releaseYear: 2001,
    director: 'Hayao Miyazaki',
    cast: ['Rumi Hiiragi', 'Miyu Irino', 'Mari Natsuki', 'Takashi Naitō'],
    poster: 'https://m.media-amazon.com/images/M/MV5BMjlmZmI5MDctNDE2YS00YWE0LWE5ZWItZDBhYWQ0NTcxNWRhXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_.jpg'
  },
  {
    title: 'Get Out',
    description: 'A young African-American man visits his white girlfriend\'s parents for the weekend, where his simmering uneasiness about their reception of him eventually reaches a boiling point. Jordan Peele\'s directorial debut is a razor-sharp social thriller.',
    genre: ['Horror', 'Thriller'],
    releaseYear: 2017,
    director: 'Jordan Peele',
    cast: ['Daniel Kaluuya', 'Allison Williams', 'Bradley Whitford', 'Catherine Keener'],
    poster: 'https://m.media-amazon.com/images/M/MV5BMjUxMDQwNjcyNl5BMl5BanBnXkFtZTgwNzcwMzc0MTI@._V1_.jpg'
  },
  {
    title: 'La La Land',
    description: 'While navigating their careers in Los Angeles, a pianist and an actress fall in love while attempting to reconcile their aspirations for the future. A modern musical that celebrates the dreamers of the City of Angels.',
    genre: ['Romance', 'Drama', 'Comedy'],
    releaseYear: 2016,
    director: 'Damien Chazelle',
    cast: ['Ryan Gosling', 'Emma Stone', 'John Legend', 'Rosemarie DeWitt'],
    poster: 'https://m.media-amazon.com/images/M/MV5BMzUzNDM2NzM2MV5BMl5BanBnXkFtZTgwNTM3NTg4OTE@._V1_.jpg'
  },
  {
    title: 'Mad Max: Fury Road',
    description: 'In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search for her homeland with the aid of a group of female prisoners, a psychotic worshiper, and a drifter named Max. A relentless action epic of survival and redemption.',
    genre: ['Action', 'Adventure', 'Sci-Fi'],
    releaseYear: 2015,
    director: 'George Miller',
    cast: ['Tom Hardy', 'Charlize Theron', 'Nicholas Hoult', 'Hugh Keays-Byrne'],
    poster: 'https://m.media-amazon.com/images/M/MV5BN2EwM2I5OWMtMGQyMi00Zjg1LWJkNTctZTdjYTA4OGUwZjMyXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_.jpg'
  },
  {
    title: 'Parasite',
    description: 'Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan. Bong Joon-ho crafts a genre-defying masterpiece about inequality that shocked the world.',
    genre: ['Drama', 'Thriller', 'Comedy'],
    releaseYear: 2019,
    director: 'Bong Joon-ho',
    cast: ['Song Kang-ho', 'Lee Sun-kyun', 'Cho Yeo-jeong', 'Choi Woo-shik'],
    poster: 'https://m.media-amazon.com/images/M/MV5BYjk1Y2U4MjQtY2ZiNS00OWQyLWI3MmYtZWUwNmRjYWRiNWNhXkEyXkFqcGc@._V1_.jpg'
  },
  {
    title: 'The Matrix',
    description: 'When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth: the life he knows is the elaborate deception of an evil cyber-intelligence. A revolutionary sci-fi action film that redefined visual storytelling.',
    genre: ['Action', 'Sci-Fi'],
    releaseYear: 1999,
    director: 'The Wachowskis',
    cast: ['Keanu Reeves', 'Laurence Fishburne', 'Carrie-Anne Moss', 'Hugo Weaving'],
    poster: 'https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDkwXkEyXkFqcGc@._V1_.jpg'
  }
];

const { connectDB, disconnectDB } = require('./config/db');

dotenv.config();

const seedDB = async () => {
  try {
    await connectDB();

    console.log('MongoDB Connected for seeding...');

    // Clear existing data
    await Watchlist.deleteMany({});
    await Review.deleteMany({});
    await Movie.deleteMany({});
    await User.deleteMany({});

    // Create admin user
    const adminUser = await User.create({
      name: 'Admin',
      email: 'admin@moviereview.com',
      password: 'admin123',
      role: 'admin'
    });
    console.log('Admin user created: admin@moviereview.com / admin123');

    // Create test user
    const testUser = await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      role: 'user'
    });
    console.log('Test user created: john@example.com / password123');

    // Insert movies
    const insertedMovies = await Movie.insertMany(movies);
    console.log(`${insertedMovies.length} movies inserted`);

    // Create some sample reviews
    const sampleReviews = [
      { movieId: insertedMovies[0]._id, userId: testUser._id, rating: 5, comment: 'An absolute masterpiece. The storytelling is incredible and the performances are outstanding. One of the greatest films ever made.' },
      { movieId: insertedMovies[1]._id, userId: testUser._id, rating: 5, comment: 'Heath Ledger\'s Joker is legendary. This film redefined what a superhero movie could be. Dark, complex, and thrilling.' },
      { movieId: insertedMovies[2]._id, userId: testUser._id, rating: 4, comment: 'Mind-bending and visually stunning. Nolan at his finest. The concept of dream within a dream is brilliantly executed.' },
      { movieId: insertedMovies[4]._id, userId: testUser._id, rating: 5, comment: 'A beautiful and emotional journey through space and time. The score by Hans Zimmer is breathtaking.' },
      { movieId: insertedMovies[0]._id, userId: adminUser._id, rating: 5, comment: 'A timeless classic that never gets old. Every rewatch reveals something new.' },
      { movieId: insertedMovies[1]._id, userId: adminUser._id, rating: 4, comment: 'Dark, gritty, and intense. A masterclass in filmmaking with an unforgettable villain.' },
      { movieId: insertedMovies[10]._id, userId: testUser._id, rating: 5, comment: 'A genre-defying film that keeps you on the edge of your seat. Bong Joon-ho is a genius.' },
      { movieId: insertedMovies[10]._id, userId: adminUser._id, rating: 5, comment: 'Brilliant social commentary wrapped in a thrilling narrative. Deserved every award it won.' },
    ];

    for (const review of sampleReviews) {
      await Review.create(review);
    }
    console.log(`${sampleReviews.length} sample reviews created`);

    // Make sure every movie carries its final aggregate rating
    for (const movie of insertedMovies) {
      await Review.calculateAverageRating(movie._id);
    }

    // A ready-to-use watchlist entry for the demo user
    await Watchlist.create({
      userId: testUser._id,
      movieId: insertedMovies[1]._id
    });
    console.log('Watchlist entry created for john@example.com');

    console.log('\nSeed completed successfully!');
    console.log('\nLogin credentials:');
    console.log('Admin: admin@moviereview.com / admin123');
    console.log('User:  john@example.com / password123');

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    await disconnectDB().catch(() => {});
    process.exit(1);
  }
};

seedDB();
