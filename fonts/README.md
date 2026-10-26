# Local game fonts

The UI and Canvas text use **WDXL Lubrifont SC**, Regular 400. The CYBER CORE
logo keeps **Orbitron**, Black 900. All fonts are served locally, with no
Google Fonts request at runtime. CSS disables synthetic bold/italic so the
single-weight Lubrifont retains its intended shapes.

Files are the unmodified WOFF2 subsets supplied by Google Fonts, downloaded
2026-10-21. Latin, extended Latin, Cyrillic and box-drawing symbols are included;
the large CJK subsets are not needed for the current Russian/English game.
Combined font files: 29,156 bytes (about 28.5 KiB).

- WDXL author: https://github.com/NightFurySL2001/WD-XL-font
- WDXL source: https://fonts.googleapis.com/css2?family=WDXL+Lubrifont+SC&display=swap
- WDXL license: [WDXL-Lubrifont-OFL.txt](WDXL-Lubrifont-OFL.txt)
- Orbitron source: https://fonts.googleapis.com/css2?family=Orbitron:wght@900&display=swap
- Orbitron license: [Orbitron-OFL.txt](Orbitron-OFL.txt)

Both are licensed under SIL OFL 1.1. The standalone build embeds the font files
and their licenses directly into its HTML.
