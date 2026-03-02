const express = require('express');
const cors = require('cors');
const redditService = require('./redditService');

const app = express();
const PORT = process.env.PORT || 3001;
const COURSE_CODE_REGEX = /^[A-Z]{2,5}[0-9]{2,4}[A-Z]?$/;
const ALLOWED_TIME_PERIODS = new Set(['hour', 'day', 'week', 'month', 'year', 'all']);

const parsePositiveInt = (value, fallback, max = 500) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const parseAllowedOrigins = () => {
  const raw = process.env.CORS_ORIGIN || '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS policy'));
  },
};

const RATE_LIMIT_WINDOW_SECONDS = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60, 3600);
const RATE_LIMIT_MAX = parsePositiveInt(process.env.RATE_LIMIT_MAX, 120, 2000);
const rateBuckets = new Map();
const getClientIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';

// Middleware
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
});
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();

  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_SECONDS * 1000;
  const bucketKey = getClientIp(req);
  const current = rateBuckets.get(bucketKey);

  if (!current || now > current.resetAt) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return next();
  }

  if (current.count >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
  }

  current.count += 1;
  return next();
});

// Routes
app.get('/api/bird-courses', async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 100, 300);
    const timePeriod = req.query.timePeriod || 'year';
    if (!ALLOWED_TIME_PERIODS.has(timePeriod)) {
      return res.status(400).json({ error: 'Invalid timePeriod. Use one of: hour, day, week, month, year, all.' });
    }
    
    const threads = await redditService.getBirdCourseThreads(limit, timePeriod);
    res.json(threads);
  } catch (error) {
    console.error('Error fetching bird courses:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/top-bird-courses', async (req, res) => {
  try {
    const count = parsePositiveInt(req.query.count, 10, 100);
    const courses = await redditService.getTopBirdCourses(count);
    if (!courses.length) {
      return res.status(503).json({
        error: 'No processed course data is available yet. Run the data pipeline first.',
      });
    }
    res.json(courses);
  } catch (error) {
    console.error('Error fetching top bird courses:', error);
    res.status(500).json({ error: error.message });
  }
});

// New endpoint for course-specific threads
app.get('/api/course-threads/:courseCode', async (req, res) => {
  try {
    const courseCode = req.params.courseCode.toUpperCase();
    const limit = parsePositiveInt(req.query.limit, 25, 100);
    
    if (!courseCode || !COURSE_CODE_REGEX.test(courseCode)) {
      return res.status(400).json({ error: 'Invalid course code format. Expected format like XX123, XXX123, or XX123A' });
    }
    
    const threads = await redditService.getCourseSpecificThreads(courseCode, limit);
    res.json(threads);
  } catch (error) {
    console.error(`Error fetching threads for course ${req.params.courseCode}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use((error, req, res, next) => {
  if (error?.message === 'Origin not allowed by CORS policy') {
    return res.status(403).json({ error: 'CORS origin denied.' });
  }
  return next(error);
});

// Start server
app.listen(PORT, () => {
  console.log(`Reddit API Service running on port ${PORT}`);
});
