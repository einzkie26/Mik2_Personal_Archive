These static TrueType faces are from [Google Fonts](https://fonts.google.com/) and are bundled for server-rendered social thumbnails. Each family has its original SIL Open Font License alongside the font files.

The local `.gitattributes` keeps these small runtime fonts in regular Git rather than Git LFS. Commit the font files along with that rule so deployment checkouts contain font data, not LFS pointers. The build verifies every font before compiling the site.

The fonts were downloaded from the Google Fonts CSS API with `User-Agent: Mozilla/5.0` and weights 400/600 (400/700 for Space Mono; 400 for Instrument Serif). The family directories in [google/fonts](https://github.com/google/fonts/tree/main/ofl) contain the license sources.

Georgia and Palatino are system fonts, so thumbnails use Lora and Cormorant Garamond respectively as bundled serif alternatives. The website and browser image exports continue to use the selected system font.
