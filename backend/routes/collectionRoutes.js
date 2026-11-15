const express = require('express');
const Collection = require('../models/Collection');
const Movie = require('../models/Movie');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const { asyncHandler, httpError, assertId, cleanString } = require('../utils/http');
const { canView } = require('../utils/access');

const router = express.Router();
router.use(protect);

const VISIBILITY = ['public', 'friends', 'private'];

async function ownCollection(id, userId) {
  assertId(id, 'collection id');
  const c = await Collection.findById(id);
  if (!c) throw httpError(404, 'Collection not found');
  if (String(c.owner) !== String(userId)) throw httpError(403, 'You can only modify your own collections');
  return c;
}

router.get('/', asyncHandler(async (req, res) => {
  res.json(await Collection.find({ owner: req.user._id }).populate('movies', 'title poster releaseYear genre').sort({ updatedAt: -1 }).lean());
}));

router.get('/:id', asyncHandler(async (req, res) => {
  assertId(req.params.id, 'collection id');
  const c = await Collection.findById(req.params.id).populate('movies').populate('owner', 'name avatar').lean();
  if (!c) throw httpError(404, 'Collection not found');
  if (!(await canView(req.user, c.owner._id, c.visibility))) throw httpError(403, 'This collection is private');
  res.json(c);
}));

router.post('/', asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name, 100);
  if (!name) throw httpError(400, 'Collection name is required');
  const c = await Collection.create({
    owner: req.user._id,
    name,
    description: cleanString(req.body.description, 500),
    visibility: VISIBILITY.includes(req.body.visibility) ? req.body.visibility : 'public'
  });
  if (req.body.share && c.visibility !== 'private') {
    await Post.create({ author: req.user._id, kind: 'collection', collectionRef: c._id, text: c.description, visibility: c.visibility === 'public' ? 'public' : 'friends' });
  }
  res.status(201).json(c);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const c = await ownCollection(req.params.id, req.user._id);
  if (req.body.name !== undefined) c.name = cleanString(req.body.name, 100) || c.name;
  if (req.body.description !== undefined) c.description = cleanString(req.body.description, 500);
  if (VISIBILITY.includes(req.body.visibility)) c.visibility = req.body.visibility;
  await c.save();
  res.json(c);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const c = await ownCollection(req.params.id, req.user._id);
  await Post.deleteMany({ collectionRef: c._id });
  await c.deleteOne();
  res.json({ message: 'Collection deleted' });
}));

router.post('/:id/movies/:movieId', asyncHandler(async (req, res) => {
  const c = await ownCollection(req.params.id, req.user._id);
  assertId(req.params.movieId, 'movie id');
  if (!(await Movie.exists({ _id: req.params.movieId }))) throw httpError(404, 'Movie not found');
  await Collection.updateOne({ _id: c._id }, { $addToSet: { movies: req.params.movieId } });
  res.json(await Collection.findById(c._id).populate('movies', 'title poster releaseYear genre'));
}));

router.delete('/:id/movies/:movieId', asyncHandler(async (req, res) => {
  const c = await ownCollection(req.params.id, req.user._id);
  await Collection.updateOne({ _id: c._id }, { $pull: { movies: req.params.movieId } });
  res.json(await Collection.findById(c._id).populate('movies', 'title poster releaseYear genre'));
}));

module.exports = router;
