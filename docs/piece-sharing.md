# Sharing a piece

Click a saved card, its title, or Read piece to open its reader and update the address to `/piece/:number`. The number stays the same after an edit. The URL opens that piece directly on refresh or in another tab, including pieces outside the latest six entries. Closing the reader returns to the archive; browser Back and Forward also work.

Copy link copies the piece URL. Share to Facebook opens Facebook's sharing dialog for that URL. This does not publish a post automatically.

Facebook and other clients that read [Open Graph metadata](https://ogp.me/) receive the title, a short writing excerpt, and a 1200 × 630 PNG. The PNG uses the saved palette, embedded photo, shadow overlay and font. Long writing is shortened in the thumbnail; the complete piece is available at the link. Server fonts and licenses are bundled under `server/fonts`; system font alternatives are documented there.

Instagram controls link display and does not provide a website-controlled way to force a pasted URL to become a feed image. Use the existing Share as post or Share as story image export to post the card itself. Add the piece URL as an Instagram profile link or a [Story link sticker](https://about.instagram.com/blog/announcements/expanding-sharing-links-in-stories-to-everyone), where available.

# Deployment

Deploy the repository to Vercel with the Vite framework preset, its normal build command, and `dist` output. Include the root `api`, `server`, and `vercel.json` files in the deployment. Uploading only the `dist` directory to static hosting does not include the social preview service.

`vercel.json` routes `/piece/:number` and `/piece/:number/image.png` to `api/share.ts`. The function includes the built HTML shell and bundled fonts. It uses the same public Supabase configuration as the frontend, with anonymous database access and an explicit `is_public` filter. No service-role key, new environment variable, storage bucket, or database migration is required.

The function uses explicit TypeScript import extensions. Keep `rewriteRelativeImportExtensions` enabled in `tsconfig.json` so the deployed JavaScript imports resolve in Node. The shared Supabase configuration is a plain `.ts` module so Vercel includes it in the compiled function. The thumbnail renderer loads only for image requests.

Private, deleted, and missing pieces return 404 without their title, body or image in public metadata. Anonymous preview requests never use a viewer's owner session. Responses are not cached by this service, so making a piece private immediately blocks new page and image requests. Social networks can retain previews they previously fetched; the site cannot remove copies already stored by those services.

After deploying, open a public piece URL in a new tab, then open the `og:image` URL from its page source. It must return a PNG without signing in or executing JavaScript. Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) to request a fresh scrape if Facebook has an earlier preview cached. Vercel deployment protection must allow public requests to the production site for social crawlers to fetch it.

`vite` and `vite preview` run the frontend alone. Use `vercel dev` when checking the Vercel functions locally. Run `node --test tests/piece-sharing.test.mjs tests/share-function.test.mjs` to check metadata, public access, generated images, font choices, and a cold start from compiled JavaScript without accessing the live database.
