# Sigil Generator

A browser-based tool for generating random sigils and symbols. Runs entirely client-side with plain HTML, CSS, and JavaScript.

## Features

- **10 outer shapes** — Circle, square, triangle, diamond, pentagon, hexagon, octagon, star, inverted star, and a fully randomized polygon.
- **Randomized inner patterns** — Each generation combines 2-5 layers from: radial lines, perimeter connections, concentric shapes, scatter dots, cross lines, and connected nodes.
- **Complexity control** — A 1-to-5 slider that adjusts layer count and density.
- **Custom colors** — Pick any background and sigil color.
- **Export** — Save as PNG or SVG, with an optional transparent background.
- **Animated background** — A subtle constellation effect behind the UI, using a separate canvas.

## How It Works

`SigilGenerator` draws onto an HTML Canvas. When the user clicks "Generate Sigil":

1. An outer shape is drawn based on the selected type (or random vertices for the "Random" option).
2. A set of inner-pattern layers is randomly chosen, weighted by complexity.
3. Each layer generates its own random parameters (angles, positions, scales) and draws onto the canvas.
4. A brief glow animation plays on the canvas frame.

All random state is stored after generation, so the same sigil can be redrawn or exported at any point without changing.

## License

GPL-3.0. See [LICENSE](LICENSE) for details.
