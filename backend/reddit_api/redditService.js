const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

class RedditService {
  constructor(options = {}) {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.clientId = options.clientId ?? process.env.REDDIT_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.REDDIT_CLIENT_SECRET;
    this.userAgent = options.userAgent ?? process.env.REDDIT_USER_AGENT;
    this.fetch = options.fetchImpl ?? global.fetch;
    this.REQUEST_DELAY = options.requestDelay ?? (this.isOAuthConfigured() ? 2000 : 61000);
    this.MAX_RETRIES = 5; // Increased from 3
    this.BASE_DELAY = 2000; // Base delay for exponential backoff
    this.lastRequestTime = 0;
    this.cachedBirdThreads = [];
    this.processedCourseDetailsPath = path.resolve(__dirname, '../data/processed/latest_course_details.json');
    this.courseDetailsDir = path.resolve(__dirname, '../data/processed/course_details');
  }

  getMissingConfiguration() {
    return [
      ['REDDIT_CLIENT_ID', this.clientId],
      ['REDDIT_CLIENT_SECRET', this.clientSecret],
      ['REDDIT_USER_AGENT', this.userAgent],
    ]
      .filter(([, value]) => !value || value.includes('your_'))
      .map(([name]) => name);
  }

  isOAuthConfigured() {
    return this.getMissingConfiguration().length === 0;
  }

  validateConfiguration() {
    const missing = this.getMissingConfiguration();
    if (missing.length > 0) {
      throw new Error(
        `Reddit OAuth is not configured. Set ${missing.join(', ')} in the repository's .env file. ` +
          'Use .env.example as the template.'
      );
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRateLimitedRequest(requestFn) {
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      // Ensure minimum delay between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.REQUEST_DELAY) {
        await this.sleep(this.REQUEST_DELAY - timeSinceLastRequest);
      }

      try {
        this.lastRequestTime = Date.now();
        return await requestFn();
      } catch (error) {
        if (error.response?.status === 429 && retries < this.MAX_RETRIES - 1) {
          retries++;
          const waitTime = error.retryAfterMs || Math.pow(3, retries) * this.BASE_DELAY;
          console.log(`Rate limited, waiting ${waitTime/1000} seconds before retry ${retries}...`);
          await this.sleep(waitTime);
          continue;
        }
        throw error;
      }
    }
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry > Date.now() + 60_000) {
      return this.accessToken;
    }

    this.validateConfiguration();

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await this.fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`Reddit OAuth token request failed with status ${response.status}`);
        error.response = { status: response.status };
        throw error;
      }

      const tokenData = await response.json();
      if (!tokenData.access_token) {
        throw new Error('Reddit OAuth response did not include an access token');
      }

      this.accessToken = tokenData.access_token;
      this.tokenExpiry = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
      return this.accessToken;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getBirdCourseThreads(limit = 100, timePeriod = 'year') {
    return this.makeRateLimitedRequest(async () => {
      const responseData = await this.searchReddit({
        q: 'bird course',
        restrict_sr: 'on',
        t: timePeriod,
        limit,
        sort: 'relevance'
      });

      if (!responseData?.data?.children) {
        return [];
      }

      const threads = responseData.data.children.map(post => {
        const data = post.data;
        return {
          id: data.id,
          title: data.title,
          author: data.author,
          created: new Date(data.created_utc * 1000).toISOString(),
          url: `https://www.reddit.com${data.permalink}`,
          selftext: data.selftext,
          score: data.score,
          num_comments: data.num_comments,
          upvote_ratio: data.upvote_ratio
        };
      });
      this.cachedBirdThreads = threads;
      return threads;
    });
  }

  async getTopBirdCourses(count = 10) {
    const details = await this.loadCourseDetails();
    return details
      .sort((a, b) => (b.bird_score || 0) - (a.bird_score || 0))
      .slice(0, count)
      .map((course) => ({
        code: course.code,
        bird_score: course.bird_score,
        mentions: course.specific_mentions ?? 0,
      }));
  }

  mapSearchPosts(responseData, searchType) {
    if (!responseData?.data?.children) return [];

    return responseData.data.children.map((post) => {
      const data = post.data;
      return {
        id: data.id,
        title: data.title,
        author: data.author,
        created: new Date(data.created_utc * 1000).toISOString(),
        url: `https://www.reddit.com${data.permalink}`,
        selftext: data.selftext,
        score: data.score,
        num_comments: data.num_comments,
        upvote_ratio: data.upvote_ratio,
        search_type: searchType,
      };
    });
  }

  async loadCourseDetails() {
    try {
      const raw = await fs.readFile(this.processedCourseDetailsPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (error) {
      console.warn('latest_course_details.json unavailable, falling back to per-course files');
    }

    try {
      const indexPath = path.join(this.courseDetailsDir, 'index.json');
      const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      if (!Array.isArray(index)) {
        return [];
      }

      const files = await Promise.allSettled(
        index.map(async (code) => {
          const fullPath = path.join(this.courseDetailsDir, `${code}.json`);
          const raw = await fs.readFile(fullPath, 'utf8');
          return JSON.parse(raw);
        })
      );

      return files
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
    } catch (error) {
      console.error('Failed to load course details from processed data:', error.message);
      return [];
    }
  }

  async getCourseSpecificThreads(courseCode, limit = 25) {
    try {
      if (!this.isOAuthConfigured()) {
        if (this.cachedBirdThreads.length > 0) {
          const normalizedCode = courseCode.replace(/\s+/g, '').toUpperCase();
          return this.cachedBirdThreads
            .filter((thread) => {
              const searchable = `${thread.title || ''} ${thread.selftext || ''}`
                .replace(/\s+/g, '')
                .toUpperCase();
              return searchable.includes(normalizedCode);
            })
            .slice(0, limit)
            .map((thread) => ({ ...thread, search_type: 'cached_bird_feed' }));
        }

        const responseData = await this.makeRateLimitedRequest(() =>
          this.searchReddit({
            q: courseCode,
            restrict_sr: 'on',
            t: 'all',
            limit,
            sort: 'relevance',
          })
        );
        return this.mapSearchPosts(responseData, 'general_match');
      }

      let allThreads = [];
      
      // First search for threads that mention the course in the title
      const titleThreads = await this.makeRateLimitedRequest(async () => {
        const responseData = await this.searchReddit({
          q: `title:${courseCode}`,  // Search specifically in titles
          restrict_sr: 'on',
          t: 'all',                  // Get all time results for more data
          limit,
          sort: 'relevance'
        });

        if (!responseData?.data?.children) return [];
        
        return responseData.data.children.map(post => {
          const data = post.data;
          return {
            id: data.id,
            title: data.title,
            author: data.author,
            created: new Date(data.created_utc * 1000).toISOString(),
            url: `https://www.reddit.com${data.permalink}`,
            selftext: data.selftext,
            score: data.score,
            num_comments: data.num_comments,
            upvote_ratio: data.upvote_ratio,
            search_type: 'title_match'
          };
        });
      });
      
      allThreads = allThreads.concat(titleThreads);
      
      // Then search for threads that mention the course in the body
      const bodyThreads = await this.makeRateLimitedRequest(async () => {
        const responseData = await this.searchReddit({
          q: `selftext:${courseCode}`,  // Search in post content
          restrict_sr: 'on',
          t: 'all',
          limit,
          sort: 'relevance'
        });

        if (!responseData?.data?.children) return [];
        
        return responseData.data.children.map(post => {
          const data = post.data;
          return {
            id: data.id,
            title: data.title,
            author: data.author,
            created: new Date(data.created_utc * 1000).toISOString(),
            url: `https://www.reddit.com${data.permalink}`,
            selftext: data.selftext,
            score: data.score,
            num_comments: data.num_comments,
            upvote_ratio: data.upvote_ratio,
            search_type: 'body_match'
          };
        });
      });
      
      allThreads = allThreads.concat(bodyThreads);
      
      // Finally, search for general mentions
      const generalThreads = await this.makeRateLimitedRequest(async () => {
        const responseData = await this.searchReddit({
          q: courseCode,  // General search
          restrict_sr: 'on',
          t: 'all',
          limit,
          sort: 'relevance'
        });

        if (!responseData?.data?.children) return [];
        
        return responseData.data.children.map(post => {
          const data = post.data;
          return {
            id: data.id,
            title: data.title,
            author: data.author,
            created: new Date(data.created_utc * 1000).toISOString(),
            url: `https://www.reddit.com${data.permalink}`,
            selftext: data.selftext,
            score: data.score,
            num_comments: data.num_comments,
            upvote_ratio: data.upvote_ratio,
            search_type: 'general_match'
          };
        });
      });
      
      allThreads = allThreads.concat(generalThreads);
      
      // Remove duplicate threads (same ID)
      const uniqueThreads = Array.from(new Map(allThreads.map(thread => [thread.id, thread])).values());
      
      console.log(`Fetched ${uniqueThreads.length} unique threads about ${courseCode} (from ${allThreads.length} total matches)`);
      return uniqueThreads;
    } catch (error) {
      console.error(`Error fetching threads for course ${courseCode}:`, error.message);
      throw new Error(`Failed to fetch course-specific data for ${courseCode}`);
    }
  }

  decodeEntities(value) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
    return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (match, entity) => {
      if (entity.toLowerCase().startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return named[entity.toLowerCase()] ?? match;
    });
  }

  atomText(entry, tag) {
    const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!match) return '';
    return this.decodeEntities(match[1].replace(/^<!\[CDATA\[|\]\]>$/g, ''));
  }

  parseAtomFeed(xml) {
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
    return {
      data: {
        children: entries.map((entry) => {
          const decodedContent = this.decodeEntities(this.atomText(entry, 'content'));
          const link = entry.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] ?? '';
          const fullUrl = this.decodeEntities(link);
          const permalink = fullUrl.replace(/^https?:\/\/www\.reddit\.com/i, '');
          const id = this.atomText(entry, 'id').replace(/^t3_/, '');
          const published = this.atomText(entry, 'published') || this.atomText(entry, 'updated');
          const author = this.atomText(entry, 'name').replace(/^\/u\//, '');
          const selftext = decodedContent
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          return {
            kind: 't3',
            data: {
              id,
              title: this.atomText(entry, 'title'),
              author,
              created_utc: Date.parse(published) / 1000,
              permalink,
              selftext,
              score: 0,
              num_comments: 0,
              upvote_ratio: null,
            },
          };
        }),
      },
    };
  }

  async searchRedditRss(params) {
    const url = new URL('https://www.reddit.com/r/wlu/search.rss');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await this.fetch(url, {
        headers: { 'User-Agent': 'BirdSignal/1.0.0' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const error = new Error(`Reddit RSS request failed with status ${response.status}`);
      error.response = { status: response.status };
      const resetSeconds = Number(response.headers?.get('x-ratelimit-reset') || 60);
      error.retryAfterMs = (resetSeconds + 1) * 1000;
      throw error;
    }

    return this.parseAtomFeed(await response.text());
  }

  async searchRedditOAuth(params) {
    const accessToken = await this.getAccessToken();
    const url = new URL('https://oauth.reddit.com/r/wlu/search');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await this.fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const error = new Error(`Reddit request failed with status ${response.status}`);
      error.response = { status: response.status };
      throw error;
    }

    return response.json();
  }

  async searchReddit(params) {
    if (this.isOAuthConfigured()) {
      return this.searchRedditOAuth(params);
    }
    return this.searchRedditRss(params);
  }
}

module.exports = new RedditService();
module.exports.RedditService = RedditService;
