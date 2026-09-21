const assert = require('node:assert/strict');
const test = require('node:test');

const { RedditService } = require('./redditService');

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const textResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  text: async () => body,
});

test('uses client-credentials OAuth and sends the bearer token to Reddit search', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/api/v1/access_token')) {
      return jsonResponse({ access_token: 'test-token', expires_in: 3600 });
    }
    return jsonResponse({ data: { children: [] } });
  };

  const service = new RedditService({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    userAgent: 'BirdSignal/1.0.0 by u/test-user',
    fetchImpl,
  });

  await service.searchReddit({ q: 'bird course', restrict_sr: 'on' });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://www.reddit.com/api/v1/access_token');
  assert.match(requests[0].options.headers.Authorization, /^Basic /);
  assert.equal(
    requests[1].url,
    'https://oauth.reddit.com/r/wlu/search?q=bird+course&restrict_sr=on'
  );
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-token');
});

test('reuses a valid OAuth token', async () => {
  let tokenRequests = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/api/v1/access_token')) {
      tokenRequests += 1;
      return jsonResponse({ access_token: 'cached-token', expires_in: 3600 });
    }
    return jsonResponse({ data: { children: [] } });
  };

  const service = new RedditService({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    userAgent: 'BirdSignal/1.0.0 by u/test-user',
    fetchImpl,
  });

  await service.searchReddit({ q: 'first' });
  await service.searchReddit({ q: 'second' });

  assert.equal(tokenRequests, 1);
});

test('uses public RSS when OAuth is not configured', async () => {
  const atom = `<?xml version="1.0"?><feed><entry>
    <author><name>/u/test-user</name></author>
    <content type="html">&lt;div&gt;&lt;p&gt;Easy course body&lt;/p&gt;&lt;/div&gt;</content>
    <id>t3_abc123</id>
    <link href="https://www.reddit.com/r/wlu/comments/abc123/example/" />
    <published>2026-09-01T12:00:00+00:00</published>
    <title>Bird course example</title>
  </entry></feed>`;
  const requests = [];
  const service = new RedditService({
    clientId: '',
    clientSecret: '',
    userAgent: '',
    fetchImpl: async (url) => {
      requests.push(String(url));
      return textResponse(atom);
    },
  });

  const result = await service.searchReddit({ q: 'bird course' });

  assert.equal(requests[0], 'https://www.reddit.com/r/wlu/search.rss?q=bird+course');
  assert.equal(result.data.children[0].data.id, 'abc123');
  assert.equal(result.data.children[0].data.author, 'test-user');
  assert.equal(result.data.children[0].data.selftext, 'Easy course body');
});

test('queries a course-specific RSS feed even after fetching the public bird-course feed', async () => {
  const requests = [];
  const service = new RedditService({
    clientId: '',
    clientSecret: '',
    userAgent: '',
    requestDelay: 0,
    fetchImpl: async (url) => {
      requests.push(String(url));
      return textResponse('<?xml version="1.0"?><feed></feed>');
    },
  });

  await service.getBirdCourseThreads(100, 'all');
  await service.getCourseSpecificThreads('BU111', 25);

  assert.equal(requests.length, 2);
  assert.match(requests[0], /q=bird\+course/);
  assert.match(requests[1], /q=BU111/);
});
