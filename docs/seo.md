# Search measurement

CloudCDN measures organic discovery in Google Search Console and Bing
Webmaster Tools. The canonical property is `https://cloudcdn.pro/`, and the
submitted sitemap is `https://cloudcdn.pro/sitemap.xml`.

## Registration

After a production deployment:

1. Verify the `https://cloudcdn.pro/` URL-prefix property in
   [Google Search Console](https://search.google.com/search-console/).
2. Submit `https://cloudcdn.pro/sitemap.xml` from **Sitemaps**, or use the
   [Search Console sitemap API](https://developers.google.com/webmaster-tools/v1/sitemaps/submit).
3. Add the site to
   [Bing Webmaster Tools](https://www.bing.com/webmasters/), preferably by
   importing the verified Search Console property.
4. Submit the same sitemap from **Sitemaps** and confirm that it reports a
   successful fetch.

The sitemap is also declared in `cdn/robots.txt`, so crawlers can discover it
without console registration. Console submission is still required because it
provides processing status, discovered URL counts, and diagnostics.

Do not commit verification tokens, OAuth credentials, or Webmaster API keys.
Store them in the relevant account or deployment secret store.

## Query groups

Review these groups independently so branded demand does not hide category
search performance:

| Group | Search Console query filter |
| :--- | :--- |
| Branded | `cloudcdn|cloud cdn|cloudcdn\.pro` |
| Self-hosted CDN | `self[- ]hosted cdn` |
| Cloudflare image CDN | `cloudflare image cdn` |
| Digital asset management | `digital asset management` |
| MCP server | `mcp server|model context protocol server` |

Search Console query regex uses RE2 and is case-insensitive by default. In
Bing, review each phrase in **Search Performance > Keywords** because the Bing
report does not provide the same saved regex-filter workflow.

## Review cadence

Record a baseline after the consoles have collected 28 complete days. Review
every four weeks, comparing the latest 28 days with the preceding 28 days.
For each query group, record:

- impressions;
- clicks;
- click-through rate;
- average position;
- the highest-impression landing page; and
- sitemap processing errors and indexed URL changes.

Use impressions and clicks as the primary trend. Average position is
diagnostic because it aggregates different locations, devices, and result
types. Search Console remains the source of truth for Google search
performance; Bing Search Performance supplies the equivalent Bing and Bing
Chat metrics.

When a group gains impressions but has weak click-through, inspect its landing
page title and description. When impressions fall, check indexing, sitemap,
manual-action, security, and crawl reports before changing page content.
