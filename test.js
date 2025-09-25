const { createClient, replaceGlobalFetch, restoreGlobalFetch, registerMiddleware } = require('./dist/index.mjs');

// Custom middleware: 1) add "/1" to request url, 2) add {modified: 1} to response
registerMiddleware('modifyUrlAndResponse', () => async (ctx, next) => {
  // 1. Add "/1" to the end of the request url (if not already present)
  const url = new URL(ctx.req.url);
  if (!url.pathname.endsWith('/1')) {
    url.pathname += '/1';
    ctx.req = new Request(url.toString(), ctx.req);
  }
  await next();
  // 2. Add {modified: 1} to the response (assume JSON response)
  if (ctx.res && ctx.res.headers.get('content-type')?.includes('application/json')) {
    const origJson = await ctx.res.json();
    const newJson = { ...origJson, modified: 1 };
    ctx.res = new Response(JSON.stringify(newJson), {
      status: ctx.res.status,
      statusText: ctx.res.statusText,
      headers: ctx.res.headers
    });
  }
});

(async () => {
  // Create a chaos-enabled fetch with custom middleware
  const chaosFetch = createClient({
    global: [{ modifyUrlAndResponse: {} }],
    routes: {
      "https://jsonplaceholder.typicode.com/todos/2": [{ fail: { body: "huh" } }]
    }
  });

  // Replace global fetch with chaos-enabled fetch
  replaceGlobalFetch(chaosFetch);

  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/todos');
    const data = await res.json();
    console.log('Fetched data:', data);
  } catch (err) {
    console.error('Fetch error:', err);
  }

  // Restore original fetch
  restoreGlobalFetch();
})();
