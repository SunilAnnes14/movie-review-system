/**
 * CineVault 2.0 demo community. Called by seed.js after the base catalog is created.
 * Everything here is stored as ordinary database records and flows through the same
 * models the API uses - nothing in the UI is hardcoded.
 */
const User = require('./models/User');
const Movie = require('./models/Movie');
const Review = require('./models/Review');
const Watchlist = require('./models/Watchlist');
const Friendship = require('./models/Friendship');
const Follow = require('./models/Follow');
const Collection = require('./models/Collection');
const Circle = require('./models/Circle');
const CircleMember = require('./models/CircleMember');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const Poll = require('./models/Poll');
const PollVote = require('./models/PollVote');
const MovieEvent = require('./models/MovieEvent');
const Post = require('./models/Post');
const Comment = require('./models/Comment');
const Notification = require('./models/Notification');
const AIRecords = require('./models/AIRecords');

const EXTRA_MOVIES = [
  { title: 'Shutter Island', year: 2010, director: 'Martin Scorsese', genre: ['Thriller', 'Mystery'], cast: ['Leonardo DiCaprio', 'Mark Ruffalo', 'Ben Kingsley', 'Michelle Williams'], keywords: ['psychological thriller', 'island', 'asylum', 'investigation', 'twist'], description: 'In 1954, U.S. Marshal Teddy Daniels investigates the disappearance of a patient from a hospital for the criminally insane on a remote, storm-lashed island, and begins to question everything around him.' },
  { title: 'Memento', year: 2000, director: 'Christopher Nolan', genre: ['Thriller', 'Mystery'], cast: ['Guy Pearce', 'Carrie-Anne Moss', 'Joe Pantoliano'], keywords: ['nonlinear timeline', 'memory loss', 'revenge', 'puzzle'], description: 'A man with short-term memory loss uses notes, photographs and tattoos to hunt for the person he believes killed his wife, told through a reverse-chronology structure.' },
  { title: 'The Prestige', year: 2006, director: 'Christopher Nolan', genre: ['Drama', 'Mystery', 'Sci-Fi'], cast: ['Hugh Jackman', 'Christian Bale', 'Scarlett Johansson', 'Michael Caine'], keywords: ['magician', 'rivalry', 'obsession', 'victorian era', 'twist'], description: 'Two rival stage magicians in Victorian London engage in a bitter battle to create the ultimate illusion, sacrificing everything to outdo one another.' },
  { title: 'Arrival', year: 2016, director: 'Denis Villeneuve', genre: ['Sci-Fi', 'Drama'], cast: ['Amy Adams', 'Jeremy Renner', 'Forest Whitaker'], keywords: ['first contact', 'linguistics', 'time', 'aliens', 'grief'], description: 'A linguist is recruited by the military to communicate with mysterious alien visitors after twelve spacecraft touch down around the world.' },
  { title: 'Blade Runner 2049', year: 2017, director: 'Denis Villeneuve', genre: ['Sci-Fi', 'Drama'], cast: ['Ryan Gosling', 'Harrison Ford', 'Ana de Armas'], keywords: ['dystopia', 'replicant', 'identity', 'neo-noir'], description: 'A young blade runner uncovers a long-buried secret that leads him to track down a former blade runner who has been missing for thirty years.' },
  { title: 'Dune', year: 2021, director: 'Denis Villeneuve', genre: ['Sci-Fi', 'Adventure'], cast: ['Timothée Chalamet', 'Rebecca Ferguson', 'Oscar Isaac', 'Zendaya'], keywords: ['desert planet', 'epic', 'empire', 'prophecy'], description: 'Paul Atreides, a gifted young man born into a great destiny, travels to the most dangerous planet in the universe to secure the future of his family and his people.' },
  { title: 'Se7en', year: 1995, director: 'David Fincher', genre: ['Crime', 'Thriller', 'Mystery'], cast: ['Brad Pitt', 'Morgan Freeman', 'Gwyneth Paltrow'], keywords: ['serial killer', 'detective', 'noir', 'seven deadly sins'], description: 'Two detectives, a weary veteran close to retirement and his impulsive new partner, hunt a serial killer who uses the seven deadly sins as his motives.' },
  { title: 'Gone Girl', year: 2014, director: 'David Fincher', genre: ['Thriller', 'Mystery', 'Drama'], cast: ['Ben Affleck', 'Rosamund Pike', 'Neil Patrick Harris'], keywords: ['missing wife', 'marriage', 'media', 'twist'], description: 'On his fifth wedding anniversary, Nick Dunne reports that his wife has gone missing, and the media frenzy that follows puts their marriage under the microscope.' },
  { title: 'Whiplash', year: 2014, director: 'Damien Chazelle', genre: ['Drama', 'Music'], cast: ['Miles Teller', 'J.K. Simmons', 'Melissa Benoist'], keywords: ['jazz', 'drummer', 'ambition', 'mentor', 'obsession'], description: 'A promising young drummer enrolls at a cut-throat music conservatory where his dreams of greatness are mentored by an instructor who will stop at nothing.' },
  { title: 'Knives Out', year: 2019, director: 'Rian Johnson', genre: ['Comedy', 'Crime', 'Mystery'], cast: ['Daniel Craig', 'Ana de Armas', 'Chris Evans', 'Jamie Lee Curtis'], keywords: ['whodunit', 'detective', 'family', 'inheritance'], description: 'When a renowned crime novelist is found dead at his estate just after his 85th birthday, an inquisitive detective is enlisted to investigate his eccentric, combative family.' },
  { title: 'The Grand Budapest Hotel', year: 2014, director: 'Wes Anderson', genre: ['Comedy', 'Adventure'], cast: ['Ralph Fiennes', 'Tony Revolori', 'Saoirse Ronan'], keywords: ['hotel', 'concierge', 'quirky', 'caper'], description: 'The adventures of a legendary concierge at a famous European hotel between the wars and the lobby boy who becomes his most trusted friend.' },
  { title: 'Everything Everywhere All at Once', year: 2022, director: 'Daniel Kwan', genre: ['Sci-Fi', 'Comedy', 'Adventure'], cast: ['Michelle Yeoh', 'Ke Huy Quan', 'Stephanie Hsu', 'Jamie Lee Curtis'], keywords: ['multiverse', 'family', 'absurd', 'mother daughter'], description: 'An aging Chinese immigrant is swept up in an insane adventure in which she alone can save existence by exploring other universes and the lives she could have led.' },
  { title: 'Oldboy', year: 2003, director: 'Park Chan-wook', genre: ['Thriller', 'Mystery', 'Drama'], cast: ['Choi Min-sik', 'Yoo Ji-tae', 'Kang Hye-jung'], keywords: ['revenge', 'imprisonment', 'mystery', 'twist'], description: 'After being kidnapped and imprisoned for fifteen years without explanation, Oh Dae-su is suddenly released and given five days to find his captor.' },
  { title: 'Her', year: 2013, director: 'Spike Jonze', genre: ['Romance', 'Sci-Fi', 'Drama'], cast: ['Joaquin Phoenix', 'Scarlett Johansson', 'Amy Adams'], keywords: ['artificial intelligence', 'loneliness', 'love', 'near future'], description: 'In a near-future Los Angeles, a lonely writer develops an unlikely relationship with an operating system designed to meet his every need.' },
  { title: 'Coco', year: 2017, director: 'Lee Unkrich', genre: ['Animation', 'Family', 'Adventure'], cast: ['Anthony Gonzalez', 'Gael García Bernal', 'Benjamin Bratt'], keywords: ['day of the dead', 'music', 'family', 'mexico'], description: 'Aspiring musician Miguel, confronted with his family\'s ancestral ban on music, enters the Land of the Dead to find his great-great-grandfather, a legendary singer.' },
  { title: 'Prisoners', year: 2013, director: 'Denis Villeneuve', genre: ['Crime', 'Thriller', 'Drama'], cast: ['Hugh Jackman', 'Jake Gyllenhaal', 'Viola Davis'], keywords: ['abduction', 'detective', 'moral dilemma', 'investigation'], description: 'When his daughter and her friend go missing, a desperate father takes matters into his own hands as the police pursue multiple leads.' }
];

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysAhead = (n, hour = 19) => { const d = new Date(Date.now() + n * 86400000); d.setHours(hour, 0, 0, 0); return d; };

async function seedSocial({ adminUser, testUser }) {
  await Promise.all([
    Friendship.deleteMany({}), Follow.deleteMany({}), Collection.deleteMany({}), Circle.deleteMany({}),
    CircleMember.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({}), Poll.deleteMany({}),
    PollVote.deleteMany({}), MovieEvent.deleteMany({}), Post.deleteMany({}), Comment.deleteMany({}),
    Notification.deleteMany({}), ...Object.values(AIRecords).map(M => M.deleteMany({}))
  ]);

  await Movie.insertMany(EXTRA_MOVIES.map(m => ({
    title: m.title, description: m.description, genre: m.genre, releaseYear: m.year, director: m.director,
    cast: m.cast, keywords: m.keywords, duration: 120 + Math.round(Math.random() * 40)
  })));
  // IMDb top classics + Tamil cinema (shared with scripts/add-movies.js)
  await require('./scripts/add-movies').addMovies();
  const all = await Movie.find().lean();
  const M = Object.fromEntries(all.map(m => [m.title, m]));

  await User.updateOne({ _id: testUser._id }, { onboarded: true, favoriteGenres: ['Sci-Fi', 'Thriller', 'Drama'], favoriteDirectors: ['Christopher Nolan'], bio: 'Will watch anything with a twist. Nolan devotee.' });
  await User.updateOne({ _id: adminUser._id }, { onboarded: true, favoriteGenres: ['Drama', 'Crime'] });

  const mk = (name, email, genres, directors, bio) => User.create({ name, email, password: 'password123', onboarded: true, favoriteGenres: genres, favoriteDirectors: directors, bio });
  const priya = await mk('Priya Sharma', 'priya@example.com', ['Sci-Fi', 'Drama', 'Mystery'], ['Denis Villeneuve', 'Christopher Nolan'], 'Sci-fi philosopher. Arrival changed my life.');
  const marcus = await mk('Marcus Lee', 'marcus@example.com', ['Thriller', 'Crime', 'Action'], ['David Fincher'], 'Dark thrillers and darker coffee.');
  const lena = await mk('Lena Okafor', 'lena@example.com', ['Comedy', 'Animation', 'Romance'], ['Wes Anderson'], 'Here for the feel-good films and the snacks.');
  const sam = await mk('Sam Rivera', 'sam@example.com', ['Sci-Fi', 'Thriller'], ['Christopher Nolan', 'Park Chan-wook'], 'Twist-ending collector.');

  // ---- Ratings (gives collaborative filtering real overlap)
  const ratings = {
    [testUser._id]: { 'Memento': 5, 'Shutter Island': 4, 'Arrival': 5, 'Se7en': 4 },
    [priya._id]: { 'Interstellar': 5, 'Inception': 5, 'Arrival': 5, 'Blade Runner 2049': 5, 'Dune': 4, 'The Prestige': 4, 'Her': 4, 'Parasite': 4, 'La La Land': 3 },
    [marcus._id]: { 'Se7en': 5, 'Gone Girl': 5, 'Prisoners': 5, 'The Dark Knight': 5, 'Oldboy': 4, 'Shutter Island': 4, 'Pulp Fiction': 4, 'Knives Out': 3, 'La La Land': 2 },
    [lena._id]: { 'The Grand Budapest Hotel': 5, 'Coco': 5, 'Spirited Away': 5, 'La La Land': 5, 'Everything Everywhere All at Once': 4, 'Knives Out': 4, 'Interstellar': 3, 'Se7en': 2 },
    [sam._id]: { 'Memento': 5, 'The Prestige': 5, 'Oldboy': 5, 'Inception': 4, 'Shutter Island': 5, 'Gone Girl': 4, 'Interstellar': 4, 'The Matrix': 4 }
  };
  const blurbs = {
    5: ['An absolute masterpiece. I was hooked from the first scene to the last.', 'Stunning direction and a screenplay that rewards every rewatch.', 'The performances are incredible and the score is unforgettable.'],
    4: ['Gripping and beautifully shot, with a couple of slow stretches.', 'Really clever storytelling and great acting from the whole cast.'],
    3: ['Solid but a little predictable. Worth watching once.', 'Good visuals, the pacing dragged in the middle.'],
    2: ['Not for me. Beautiful to look at but the story felt flat.']
  };
  let i = 0;
  for (const [userId, map] of Object.entries(ratings)) {
    for (const [title, rating] of Object.entries(map)) {
      if (!M[title]) continue;
      const pool = blurbs[rating];
      const review = await Review.create({ movieId: M[title]._id, userId, rating, comment: pool[i++ % pool.length], createdAt: daysAgo(5 + (i * 7) % 300) });
      await Watchlist.updateOne({ userId, movieId: M[title]._id }, { status: 'watched', watchedAt: daysAgo(5 + (i * 11) % 330) }, { upsert: true });
      if (rating >= 4 && i % 3 === 0) await Post.create({ author: userId, kind: 'review', movie: M[title]._id, review: review._id, visibility: 'public', createdAt: daysAgo((i * 3) % 40) });
    }
  }
  // A review containing a spoiler (sentence-level hiding demo)
  const spoilerReview = await Review.create({ movieId: M['The Prestige']._id, userId: marcus._id, rating: 5, comment: 'Christian Bale is phenomenal. It turns out the whole rivalry hinges on a secret twin, which recontextualises every scene. The final reveal floored me.', containsSpoilers: true, spoilerSentences: [1, 2], spoilerMarkedBy: 'auto' });
  await Post.create({ author: marcus._id, kind: 'review', movie: M['The Prestige']._id, review: spoilerReview._id, visibility: 'public', isSpoiler: true, spoilerMarkedBy: 'auto', createdAt: daysAgo(2) });
  for (const m of all) await Review.calculateAverageRating(m._id);

  // Vault entries for John across statuses
  for (const [title, status] of [['Dune', 'want_to_watch'], ['Blade Runner 2049', 'want_to_watch'], ['Prisoners', 'watching'], ['Gone Girl', 'want_to_watch']]) {
    await Watchlist.updateOne({ userId: testUser._id, movieId: M[title]._id }, { status }, { upsert: true });
  }
  await Watchlist.updateOne({ userId: testUser._id, movieId: M['Interstellar']._id }, { status: 'watched', watchedAt: daysAgo(40), favorite: true }, { upsert: true });

  // ---- Social graph
  await Friendship.create([
    { requester: testUser._id, recipient: priya._id, status: 'accepted', acceptedAt: daysAgo(60) },
    { requester: marcus._id, recipient: testUser._id, status: 'accepted', acceptedAt: daysAgo(45) },
    { requester: testUser._id, recipient: lena._id, status: 'accepted', acceptedAt: daysAgo(30) },
    { requester: priya._id, recipient: marcus._id, status: 'accepted', acceptedAt: daysAgo(50) },
    { requester: sam._id, recipient: testUser._id, status: 'pending' }
  ]);
  await Follow.create([{ follower: testUser._id, following: sam._id }, { follower: lena._id, following: priya._id }, { follower: sam._id, following: testUser._id }]);

  await Collection.create({ owner: testUser._id, name: 'Mind-benders', description: 'Films that rearrange your brain.', visibility: 'public', movies: ['Inception', 'Memento', 'The Prestige', 'Shutter Island'].map(t => M[t]._id) });

  // ---- CineCircles
  const club = await Circle.create({ name: 'Weekend Movie Club', description: 'Five friends, one big screen, every Saturday. Thrillers and sci-fi preferred, snacks mandatory.', visibility: 'private', owner: testUser._id, memberCount: 4 });
  const clubMembers = [testUser, priya, marcus, lena];
  await CircleMember.create(clubMembers.map((u, idx) => ({ circle: club._id, user: u._id, role: idx === 0 ? 'owner' : idx === 1 ? 'admin' : 'member', createdAt: daysAgo(40 - idx) })));
  const clubConv = await Conversation.create({ type: 'circle', circle: club._id, participants: clubMembers.map(u => u._id), reads: clubMembers.map(u => ({ user: u._id, at: daysAgo(1) })) });
  club.conversation = clubConv._id;
  club.sharedWatchlist = [{ movie: M['Dune']._id, addedBy: priya._id }, { movie: M['Knives Out']._id, addedBy: lena._id }, { movie: M['Prisoners']._id, addedBy: marcus._id }];
  await club.save();

  const nolan = await Circle.create({ name: 'Nolan Nerds', description: 'Timelines, practical effects and Hans Zimmer appreciation. Everyone welcome.', visibility: 'public', owner: priya._id, memberCount: 3 });
  await CircleMember.create([{ circle: nolan._id, user: priya._id, role: 'owner' }, { circle: nolan._id, user: sam._id, role: 'member' }, { circle: nolan._id, user: testUser._id, role: 'member' }]);
  const nolanConv = await Conversation.create({ type: 'circle', circle: nolan._id, participants: [priya._id, sam._id, testUser._id], reads: [priya, sam, testUser].map(u => ({ user: u._id, at: daysAgo(3) })) });
  nolan.conversation = nolanConv._id;
  await nolan.save();

  // ---- Chat history
  const msgs = [
    [priya, 'Who is in for Saturday? I vote something with a big screen experience.', 26],
    [marcus, 'In. As long as it is not another musical 😅', 25.9],
    [lena, 'Hey! La La Land is a classic. But fine, I am in.', 25.8],
    [testUser, 'I will set up a poll so we stop arguing 🗳️', 25.7]
  ];
  for (const [u, text, hoursAgo] of msgs) await Message.create({ conversation: clubConv._id, sender: u._id, text, createdAt: new Date(Date.now() - hoursAgo * 3600000) });
  await Message.create({ conversation: clubConv._id, sender: priya._id, kind: 'movie', movie: M['Dune']._id, text: 'Also adding this one to the shared watchlist', createdAt: new Date(Date.now() - 2 * 3600000) });
  await Message.create({ conversation: clubConv._id, sender: marcus._id, text: 'Rewatched Gone Girl last night. In the end she frames him and gets away with it, wild.', isSpoiler: true, spoilerMarkedBy: 'auto', movie: M['Gone Girl']._id, createdAt: new Date(Date.now() - 3600000) });
  await Conversation.updateOne({ _id: clubConv._id }, { lastMessageAt: new Date(Date.now() - 3600000), lastMessagePreview: '⚠️ Spoiler' });
  await Message.create({ conversation: nolanConv._id, sender: sam._id, text: 'Memento on a second watch is a completely different movie.', createdAt: daysAgo(4) });
  await Conversation.updateOne({ _id: nolanConv._id }, { lastMessageAt: daysAgo(4), lastMessagePreview: 'Memento on a second watch is a completely different movie.' });
  const dm = await Conversation.create({ type: 'direct', participants: [testUser._id, priya._id], directKey: [String(testUser._id), String(priya._id)].sort().join(':'), reads: [{ user: testUser._id, at: daysAgo(2) }, { user: priya._id, at: new Date() }] });
  await Message.create({ conversation: dm._id, sender: priya._id, kind: 'recommendation', movie: M['Arrival']._id, text: 'You HAVE to see this if you liked Interstellar.', createdAt: daysAgo(1) });
  await Conversation.updateOne({ _id: dm._id }, { lastMessageAt: daysAgo(1), lastMessagePreview: 'You HAVE to see this if you liked Interstellar.' });

  // ---- Past poll -> past event (history for CinePulse)
  const pastPoll = await Poll.create({
    circle: club._id, creator: testUser._id, question: 'Movie for last Saturday?', status: 'closed', closedAt: daysAgo(16), createdAt: daysAgo(18),
    options: ['Interstellar', 'Inception', 'Se7en', 'La La Land'].map(t => ({ movie: M[t]._id, label: t }))
  });
  const pastVotes = [[testUser, 0], [priya, 0], [marcus, 2], [lena, 0]];
  for (const [u, opt] of pastVotes) await PollVote.create({ poll: pastPoll._id, user: u._id, option: pastPoll.options[opt]._id, createdAt: daysAgo(17) });
  pastPoll.options[0].votes = 3; pastPoll.options[2].votes = 1; pastPoll.totalVotes = 4; pastPoll.voterCount = 4; pastPoll.winner = pastPoll.options[0]._id;
  const pastEvent = await MovieEvent.create({
    circle: club._id, creator: testUser._id, poll: pastPoll._id, movie: M['Interstellar']._id, title: 'Saturday Movie Night: Interstellar',
    startsAt: daysAgo(14), venue: 'Grand Cinema IMAX', status: 'completed', reminders: { day: true, hour: true },
    attendees: clubMembers.map(u => ({ user: u._id, rsvp: 'going', respondedAt: daysAgo(16) })),
    feedback: [{ user: testUser._id, rating: 5, comment: 'IMAX was worth it' }, { user: priya._id, rating: 5 }, { user: marcus._id, rating: 4 }, { user: lena._id, rating: 4, comment: 'Cried twice' }]
  });
  pastPoll.event = pastEvent._id;
  await pastPoll.save();

  // ---- Open poll for this weekend
  const open = await Poll.create({
    circle: club._id, creator: priya._id, question: 'What should we watch this Saturday?', expiresAt: daysAhead(2, 18),
    options: ['Dune', 'Prisoners', 'Knives Out', 'Blade Runner 2049'].map(t => ({ movie: M[t]._id, label: t }))
  });
  for (const [u, opt] of [[priya, 0], [marcus, 1], [lena, 2]]) await PollVote.create({ poll: open._id, user: u._id, option: open.options[opt]._id });
  open.options[0].votes = 1; open.options[1].votes = 1; open.options[2].votes = 1; open.totalVotes = 3; open.voterCount = 3;
  await open.save();
  await Post.create({ author: priya._id, circle: club._id, kind: 'poll', poll: open._id, text: open.question, visibility: 'circle', createdAt: daysAgo(1) });

  // ---- Upcoming event in the public circle
  const upcoming = await MovieEvent.create({
    circle: nolan._id, creator: priya._id, movie: M['The Prestige']._id, title: 'Nolan Marathon Night 1: The Prestige',
    description: 'Kicking off the marathon at my place. Bring your theories!', startsAt: daysAhead(5), venue: "Priya's living room", bookingUrl: '',
    attendees: [{ user: priya._id, rsvp: 'going' }, { user: sam._id, rsvp: 'going' }, { user: testUser._id, rsvp: 'invited' }],
    proposals: [{ startsAt: daysAhead(6), proposedBy: sam._id, available: [sam._id] }]
  });
  await Post.create({ author: priya._id, circle: nolan._id, kind: 'event', event: upcoming._id, movie: M['The Prestige']._id, text: upcoming.title, visibility: 'circle', createdAt: daysAgo(1) });

  // ---- Feed posts
  const p1 = await Post.create({ author: priya._id, kind: 'recommendation', movie: M['Arrival']._id, text: 'Quietly the most moving first-contact film ever made. Watch it with headphones.', visibility: 'public', likes: [testUser._id, lena._id], likeCount: 2, commentCount: 1, createdAt: daysAgo(1) });
  await Comment.create({ post: p1._id, author: testUser._id, text: 'Adding it to my vault right now.' });
  await Post.create({ author: lena._id, kind: 'text', text: 'Hot take: comfort movies deserve more respect than "important" movies. What is yours?', visibility: 'friends', createdAt: new Date(Date.now() - 5 * 3600000) });
  await Post.create({ author: marcus._id, kind: 'watch_update', movie: M['Prisoners']._id, watchStatus: 'watched', visibility: 'friends', createdAt: new Date(Date.now() - 9 * 3600000) });

  await Notification.create([
    { user: testUser._id, actor: sam._id, type: 'friend_request', title: 'Sam Rivera sent you a friend request', link: '/people' },
    { user: testUser._id, actor: priya._id, type: 'poll_created', title: 'New poll in Weekend Movie Club', body: 'What should we watch this Saturday?', link: `/circles/${club._id}?tab=polls` },
    { user: testUser._id, actor: priya._id, type: 'event_created', title: 'Nolan Marathon Night 1: The Prestige', body: 'Priya planned a movie night in Nolan Nerds. RSVP now!', link: `/events/${upcoming._id}` }
  ]);

  console.log(`CineVault 2.0 community seeded: ${EXTRA_MOVIES.length} extra movies, 4 more users, 2 circles, polls, events, chats and posts`);
  console.log('Extra users (password123): priya@example.com, marcus@example.com, lena@example.com, sam@example.com');
}

module.exports = seedSocial;
