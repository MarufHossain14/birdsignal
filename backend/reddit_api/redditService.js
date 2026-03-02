const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: '../../.env' });

class RedditService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.userAgent = 'BirdSignal/1.0.0 (by /u/your_username)';
    this.REQUEST_DELAY = 2000; // 2 seconds between requests
    this.MAX_RETRIES = 5; // Increased from 3
    this.BASE_DELAY = 2000; // Base delay for exponential backoff
    this.lastRequestTime = 0;
    this.processedCourseDetailsPath = path.resolve(__dirname, '../data/processed/latest_course_details.json');
    this.courseDetailsDir = path.resolve(__dirname, '../data/processed/course_details');
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
          const waitTime = Math.pow(3, retries) * this.BASE_DELAY; // More aggressive exponential backoff
          console.log(`Rate limited, waiting ${waitTime/1000} seconds before retry ${retries}...`);
          await this.sleep(waitTime);
          continue;
        }
        throw error;
      }
    }
  }

  async getAccessToken() {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      // For Reddit's API, we can use an "app only" OAuth flow
      // This doesn't require a username/password, just client credentials
      // Or we can use the public API without authentication for read-only operations
      await this.searchReddit({
        q: 'bird course',
        restrict_sr: 'on',
        t: 'year',
        limit: 100,
        sort: 'relevance'
      });

      return 'public-access'; // Not using actual OAuth for simplicity
    } catch (error) {
      console.error('Error connecting to Reddit:', error.message);
      throw new Error('Failed to connect to Reddit API');
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
          upvote_ratio: data.upvote_ratio
        };
      });
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

  async searchReddit(params) {
    const url = new URL('https://www.reddit.com/r/wlu/search.json');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': this.userAgent,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const error = new Error(`Reddit request failed with status ${response.status}`);
      error.response = { status: response.status };
      throw error;
    }

    return response.json();
  }
}

module.exports = new RedditService();
