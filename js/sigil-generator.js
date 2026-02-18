/**
 * SigilGenerator — algorithmic sigil creation with randomised inner patterns.
 *
 * Proportion constants (all relative to canvas size):
 *   SHAPE_RATIO  0.70  — outer shape diameter / side
 *   STROKE_RATIO 0.02  — main stroke width
 *   DOT_RATIO    0.03  — scatter dot radius
 *
 * Inner-pattern layers (2-4 randomly chosen per generation):
 *   1. Radial lines      — lines from center to shape edge
 *   2. Perimeter connects — random edge points connected by lines
 *   3. Concentric shapes  — smaller rotated copies of the outer shape
 *   4. Scatter dots       — multiple randomly placed dots
 *   5. Arc segments       — partial circles at random positions
 *   6. Cross lines        — straight lines slicing across the shape
 */
class SigilGenerator {
    static SHAPE_RATIO  = 0.70;
    static STROKE_RATIO = 0.02;
    static DOT_RATIO    = 0.03;

    /** All available inner-pattern layer names */
    static LAYERS = [
        'radialLines',
        'perimeterConnections',
        'concentricShapes',
        'scatterDots',
        'crossLines',
        'connectedNodes'
    ];

    /** All shape types available for concentric mixing */
    static ALL_SHAPES = [
        'circle', 'square', 'triangle', 'diamond',
        'pentagon', 'hexagon', 'octagon', 'star', 'star-inverted'
    ];

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');

        this.shape      = 'circle';
        this.bgColor    = '#000000';
        this.sigilColor = '#ff0000';

        // Randomised state stored so we can redraw / export identically
        this.dotPosition    = null;   // kept for backward compat (single dot)
        this._layerState    = null;   // full randomised layer data
        this._randomVertices = null;  // stored vertices for 'random' shape
    }

    /* ====================================================
       Public API
    ==================================================== */

    generate() {
        // If shape is 'random', generate new random vertices each time
        if (this.shape === 'random') {
            this._randomVertices = this._generateRandomPolygon();
        }
        this._layerState = this._buildLayerState();
        this._animateGlow();
    }

    redraw() {
        if (!this._layerState) { this.generate(); return; }
        this._draw();
    }

    drawEmpty() {
        const ctx = this.ctx, size = this.canvas.width;
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, size, size);
    }

    exportPNG(transparent = false) {
        if (!transparent) return this.canvas.toDataURL('image/png');
        const tmp = document.createElement('canvas');
        tmp.width = this.canvas.width;
        tmp.height = this.canvas.height;
        const saved = this.canvas;
        this.canvas = tmp;
        this.ctx = tmp.getContext('2d');
        this._draw(true);
        const url = tmp.toDataURL('image/png');
        this.canvas = saved;
        this.ctx = saved.getContext('2d');
        return url;
    }

    exportSVG(transparent = false) {
        // For SVG we re-render to a hidden canvas and trace — keeps parity simple.
        // (A full SVG rebuild of every random layer is possible but overkill for now.)
        const size = this.canvas.width;
        const strokeW = size * SigilGenerator.STROKE_RATIO;
        const dotR = size * SigilGenerator.DOT_RATIO;
        const cx = size / 2, cy = size / 2;

        // We'll build SVG elements for the outer shape + embed a raster of inner layers
        let outerMarkup = '';
        if (this.shape === 'circle') {
            const r = (size * SigilGenerator.SHAPE_RATIO) / 2;
            outerMarkup = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${this.sigilColor}" stroke-width="${strokeW}"/>`;
        } else {
            const verts = this._getShapeVertices(size);
            const pts = verts.map(v => `${v.x},${v.y}`).join(' ');
            outerMarkup = `<polygon points="${pts}" fill="none" stroke="${this.sigilColor}" stroke-width="${strokeW}" stroke-linejoin="miter"/>`;
        }

        // Render inner layers to a temp canvas and embed as image
        const tmp = document.createElement('canvas');
        tmp.width = size; tmp.height = size;
        const savedCanvas = this.canvas;
        const savedCtx = this.ctx;
        this.canvas = tmp;
        this.ctx = tmp.getContext('2d');
        this._drawInnerLayers(size, 0);
        const innerDataUrl = tmp.toDataURL('image/png');
        this.canvas = savedCanvas;
        this.ctx = savedCtx;

        const bgRect = transparent ? '' : `  <rect width="100%" height="100%" fill="${this.bgColor}"/>`;

        return [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
            bgRect,
            `  <image href="${innerDataUrl}" width="${size}" height="${size}"/>`,
            `  ${outerMarkup}`,
            `</svg>`
        ].filter(Boolean).join('\n');
    }

    /* ====================================================
       Layer state generation  (all randomness happens here)
    ==================================================== */

    _buildLayerState() {
        // Pick 2-3 random layers
        const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
        const shuffled = [...SigilGenerator.LAYERS].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, count);

        const state = { layers: chosen };

        // Generate random params for every chosen layer
        if (chosen.includes('radialLines')) {
            const n = 2 + Math.floor(Math.random() * 4); // 2-5 lines
            const angles = [];
            for (let i = 0; i < n; i++) angles.push(Math.random() * Math.PI * 2);
            state.radialLines = { angles };
        }

        if (chosen.includes('perimeterConnections')) {
            const n = 3 + Math.floor(Math.random() * 3); // 3-5 points
            const tValues = []; // normalised 0-1 positions along perimeter
            for (let i = 0; i < n; i++) tValues.push(Math.random());
            tValues.sort((a, b) => a - b);
            // Decide connection style: 0 = sequential, 1 = every-other, 2 = all-to-all (rare)
            const r = Math.random();
            const style = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
            state.perimeterConnections = { tValues, style };
        }

        if (chosen.includes('concentricShapes')) {
            const n = 1 + Math.floor(Math.random() * 3); // 1-3 inner shapes
            const rings = [];
            for (let i = 0; i < n; i++) {
                // 50% chance: same as outer shape, 50% chance: random different shape
                let ringShape;
                if (Math.random() < 0.5) {
                    ringShape = this.shape;
                } else {
                    const pool = SigilGenerator.ALL_SHAPES;
                    ringShape = pool[Math.floor(Math.random() * pool.length)];
                }
                rings.push({
                    shape: ringShape,
                    scale: 0.2 + Math.random() * 0.45, // 20-65% of outer
                    rotation: (Math.random() - 0.5) * Math.PI * 0.4 // ±36°
                });
            }
            state.concentricShapes = { rings };
        }

        if (chosen.includes('scatterDots')) {
            const n = 2 + Math.floor(Math.random() * 4); // 2-5 dots
            const dots = [];
            const minDist = 0.15; // minimum normalised distance between dots
            const centerAvoid = 0.12; // avoid this radius around center (normalised)
            for (let i = 0; i < n; i++) {
                let placed = false;
                for (let attempt = 0; attempt < 50; attempt++) {
                    const candidate = this._randomPointInShape();
                    // Check distance from center
                    const dcx = candidate.nx - 0.5, dcy = candidate.ny - 0.5;
                    if (Math.sqrt(dcx * dcx + dcy * dcy) < centerAvoid) continue;
                    // Check distance from existing dots
                    let tooClose = false;
                    for (const d of dots) {
                        const dx = candidate.nx - d.nx, dy = candidate.ny - d.ny;
                        if (Math.sqrt(dx * dx + dy * dy) < minDist) { tooClose = true; break; }
                    }
                    if (!tooClose) { dots.push(candidate); placed = true; break; }
                }
                if (!placed) dots.push(this._randomPointInShape()); // fallback
            }
            state.scatterDots = { dots, radiusMultiplier: 0.5 + Math.random() * 1.0 };
        }

        if (chosen.includes('crossLines')) {
            const n = 1 + Math.floor(Math.random() * 3); // 1-3 lines
            const lines = [];
            for (let i = 0; i < n; i++) {
                lines.push({
                    angle: Math.random() * Math.PI, // direction
                    offset: (Math.random() - 0.5) * 0.25 // ±12.5% off-center
                });
            }
            state.crossLines = { lines };
        }

        if (chosen.includes('connectedNodes')) {
            const n = 2 + Math.floor(Math.random() * 4); // 2-5 nodes
            const nodes = [];
            const minDist = 0.18;
            for (let i = 0; i < n; i++) {
                let placed = false;
                for (let attempt = 0; attempt < 50; attempt++) {
                    const candidate = this._randomPointInShape();
                    let tooClose = false;
                    for (const nd of nodes) {
                        const dx = candidate.nx - nd.nx, dy = candidate.ny - nd.ny;
                        if (Math.sqrt(dx * dx + dy * dy) < minDist) { tooClose = true; break; }
                    }
                    if (!tooClose) { nodes.push(candidate); placed = true; break; }
                }
                if (!placed) nodes.push(this._randomPointInShape());
            }
            // Connection style: 0 = sequential, 1 = star (all from first), 2 = all-to-all (rare)
            const r = Math.random();
            const style = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
            state.connectedNodes = { nodes, style, radiusMultiplier: 0.6 + Math.random() * 0.8 };
        }

        return state;
    }

    /* ====================================================
       Drawing
    ==================================================== */

    _draw(transparent = false, glowIntensity = 0) {
        const ctx  = this.ctx;
        const size = this.canvas.width;
        const cx = size / 2, cy = size / 2;
        const strokeW = size * SigilGenerator.STROKE_RATIO;

        // Background
        ctx.clearRect(0, 0, size, size);
        if (!transparent) {
            ctx.fillStyle = this.bgColor;
            ctx.fillRect(0, 0, size, size);
        }

        // Glow
        if (glowIntensity > 0) {
            ctx.shadowColor = this.sigilColor;
            ctx.shadowBlur  = glowIntensity * size * 0.06;
        } else {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur  = 0;
        }

        // Inner layers (drawn BEFORE outer shape so shape sits on top)
        this._drawInnerLayers(size, glowIntensity);

        // Outer shape
        ctx.strokeStyle = this.sigilColor;
        ctx.lineWidth   = strokeW;
        ctx.lineJoin    = 'miter';

        if (this.shape === 'circle') {
            const r = (size * SigilGenerator.SHAPE_RATIO) / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            const vertices = this._getShapeVertices(size);
            ctx.beginPath();
            ctx.moveTo(vertices[0].x, vertices[0].y);
            for (let i = 1; i < vertices.length; i++) {
                ctx.lineTo(vertices[i].x, vertices[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur  = 0;
    }

    /* ---------- Inner pattern layer renderers ---------- */

    _drawInnerLayers(size, glowIntensity) {
        if (!this._layerState) return;
        const ctx = this.ctx;
        const ls  = this._layerState;
        const cx  = size / 2, cy = size / 2;
        const shapeR   = (size * SigilGenerator.SHAPE_RATIO) / 2;
        const thinLine = size * SigilGenerator.STROKE_RATIO * 0.6;
        const dotR     = size * SigilGenerator.DOT_RATIO;

        // Clip to shape so inner elements never escape
        ctx.save();
        this._clipToShape(ctx, size);

        ctx.strokeStyle = this.sigilColor;
        ctx.fillStyle   = this.sigilColor;

        for (const layerName of ls.layers) {
            switch (layerName) {

                /* --- 1. Radial lines --- */
                case 'radialLines': {
                    const { angles } = ls.radialLines;
                    ctx.lineWidth = thinLine;
                    for (const a of angles) {
                        ctx.beginPath();
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(cx + Math.cos(a) * shapeR, cy + Math.sin(a) * shapeR);
                        ctx.stroke();
                    }
                    // Cap the center to cover anti-alias gaps
                    ctx.beginPath();
                    ctx.arc(cx, cy, thinLine * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }

                /* --- 2. Perimeter connections --- */
                case 'perimeterConnections': {
                    const { tValues, style } = ls.perimeterConnections;
                    const pts = tValues.map(t => this._pointOnPerimeter(t, size));
                    ctx.lineWidth = thinLine;
                    if (style === 0) {
                        // Sequential
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                        ctx.closePath();
                        ctx.stroke();
                    } else if (style === 1) {
                        // Every-other (star pattern)
                        for (let step = 2; step <= Math.floor(pts.length / 2); step++) {
                            ctx.beginPath();
                            for (let i = 0; i < pts.length; i++) {
                                const j = (i * step) % pts.length;
                                if (i === 0) ctx.moveTo(pts[j].x, pts[j].y);
                                else ctx.lineTo(pts[j].x, pts[j].y);
                            }
                            ctx.closePath();
                            ctx.stroke();
                            break; // only one pass
                        }
                    } else {
                        // All-to-all
                        for (let i = 0; i < pts.length; i++) {
                            for (let j = i + 1; j < pts.length; j++) {
                                ctx.beginPath();
                                ctx.moveTo(pts[i].x, pts[i].y);
                                ctx.lineTo(pts[j].x, pts[j].y);
                                ctx.stroke();
                            }
                        }
                    }
                    break;
                }

                /* --- 3. Concentric shapes --- */
                case 'concentricShapes': {
                    const { rings } = ls.concentricShapes;
                    ctx.lineWidth = thinLine;
                    for (const ring of rings) {
                        if (ring.shape === 'circle') {
                            ctx.beginPath();
                            ctx.arc(cx, cy, shapeR * ring.scale, 0, Math.PI * 2);
                            ctx.stroke();
                        } else {
                            const ringVerts = this._getVerticesForShape(ring.shape, size);
                            const rotated = ringVerts.map(v => {
                                const dx = (v.x - cx) * ring.scale;
                                const dy = (v.y - cy) * ring.scale;
                                const cos = Math.cos(ring.rotation);
                                const sin = Math.sin(ring.rotation);
                                return {
                                    x: cx + dx * cos - dy * sin,
                                    y: cy + dx * sin + dy * cos
                                };
                            });
                            ctx.beginPath();
                            ctx.moveTo(rotated[0].x, rotated[0].y);
                            for (let i = 1; i < rotated.length; i++) ctx.lineTo(rotated[i].x, rotated[i].y);
                            ctx.closePath();
                            ctx.stroke();
                        }
                    }
                    break;
                }

                /* --- 4. Scatter dots --- */
                case 'scatterDots': {
                    const { dots, radiusMultiplier } = ls.scatterDots;
                    const r = dotR * radiusMultiplier;
                    for (const d of dots) {
                        const pos = this._normalizedToCanvas(d, size);
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    break;
                }

                /* --- 5. Cross lines --- */
                case 'crossLines': {
                    const { lines } = ls.crossLines;
                    ctx.lineWidth = thinLine;
                    for (const l of lines) {
                        const offX = Math.cos(l.angle + Math.PI / 2) * l.offset * shapeR;
                        const offY = Math.sin(l.angle + Math.PI / 2) * l.offset * shapeR;
                        const dx = Math.cos(l.angle) * shapeR;
                        const dy = Math.sin(l.angle) * shapeR;
                        ctx.beginPath();
                        ctx.moveTo(cx + offX - dx, cy + offY - dy);
                        ctx.lineTo(cx + offX + dx, cy + offY + dy);
                        ctx.stroke();
                    }
                    break;
                }

                /* --- 6. Connected nodes --- */
                case 'connectedNodes': {
                    const { nodes, style, radiusMultiplier } = ls.connectedNodes;
                    const r = dotR * radiusMultiplier;
                    const pts = nodes.map(nd => this._normalizedToCanvas(nd, size));

                    // Draw connecting lines first (behind the nodes)
                    ctx.lineWidth = thinLine;
                    if (style === 0) {
                        // Sequential chain
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                        ctx.stroke();
                    } else if (style === 1) {
                        // Star: all connect to first node
                        for (let i = 1; i < pts.length; i++) {
                            ctx.beginPath();
                            ctx.moveTo(pts[0].x, pts[0].y);
                            ctx.lineTo(pts[i].x, pts[i].y);
                            ctx.stroke();
                        }
                    } else {
                        // All-to-all
                        for (let i = 0; i < pts.length; i++) {
                            for (let j = i + 1; j < pts.length; j++) {
                                ctx.beginPath();
                                ctx.moveTo(pts[i].x, pts[i].y);
                                ctx.lineTo(pts[j].x, pts[j].y);
                                ctx.stroke();
                            }
                        }
                    }

                    // Draw hollow dots (stroke only, clear inside)
                    for (const p of pts) {
                        // Clear the inside by filling with background
                        ctx.fillStyle = this.bgColor;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                        ctx.fill();
                        // Stroke the ring
                        ctx.strokeStyle = this.sigilColor;
                        ctx.lineWidth = thinLine;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    // Restore fill/stroke for other layers
                    ctx.fillStyle = this.sigilColor;
                    ctx.strokeStyle = this.sigilColor;
                    break;
                }
            }
        }

        ctx.restore(); // release clip
    }

    /* ====================================================
       Clipping helper — clips drawing to the shape interior
    ==================================================== */

    _clipToShape(ctx, size) {
        const cx = size / 2, cy = size / 2;
        if (this.shape === 'circle') {
            const r = (size * SigilGenerator.SHAPE_RATIO) / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.clip();
        } else {
            const verts = this._getShapeVertices(size);
            ctx.beginPath();
            ctx.moveTo(verts[0].x, verts[0].y);
            for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
            ctx.closePath();
            ctx.clip();
        }
    }

    /* ====================================================
       Perimeter point helper
    ==================================================== */

    /**
     * Get a point at normalised position t (0–1) along the shape's perimeter.
     */
    _pointOnPerimeter(t, size) {
        const cx = size / 2, cy = size / 2;
        const r = (size * SigilGenerator.SHAPE_RATIO) / 2;

        if (this.shape === 'circle') {
            const angle = t * Math.PI * 2;
            return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
        }

        const verts = this._getShapeVertices(size);
        const n = verts.length;
        // Calculate total perimeter
        let perimeter = 0;
        const segs = [];
        for (let i = 0; i < n; i++) {
            const a = verts[i], b = verts[(i + 1) % n];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            segs.push({ a, b, len });
            perimeter += len;
        }
        let target = t * perimeter;
        for (const seg of segs) {
            if (target <= seg.len) {
                const frac = target / seg.len;
                return {
                    x: seg.a.x + (seg.b.x - seg.a.x) * frac,
                    y: seg.a.y + (seg.b.y - seg.a.y) * frac
                };
            }
            target -= seg.len;
        }
        return { x: verts[0].x, y: verts[0].y };
    }

    /**
     * Convert a normalised {nx, ny} to canvas-space coordinates inside the shape.
     */
    _normalizedToCanvas(pt, size) {
        const cx = size / 2, cy = size / 2;
        const dotR = size * SigilGenerator.DOT_RATIO;
        const strokeW = size * SigilGenerator.STROKE_RATIO;
        const padding = dotR + strokeW / 2;

        if (this.shape === 'circle') {
            const shapeR = (size * SigilGenerator.SHAPE_RATIO) / 2;
            const innerR = shapeR - padding;
            const offX = (pt.nx - 0.5) * 2;
            const offY = (pt.ny - 0.5) * 2;
            return { x: cx + offX * innerR, y: cy + offY * innerR };
        }

        const verts = this._getShapeVertices(size);
        const bounds = this._getBounds(verts);
        const innerMinX = bounds.minX + padding;
        const innerMinY = bounds.minY + padding;
        const innerW = (bounds.maxX - bounds.minX) - padding * 2;
        const innerH = (bounds.maxY - bounds.minY) - padding * 2;
        return {
            x: innerMinX + pt.nx * innerW,
            y: innerMinY + pt.ny * innerH
        };
    }

    /* ====================================================
       Glow animation
    ==================================================== */

    _animateGlow() {
        if (this._animFrame) cancelAnimationFrame(this._animFrame);
        const duration = 800;
        const start = performance.now();

        const tick = (now) => {
            const elapsed = now - start;
            const t = Math.min(elapsed / duration, 1);
            let glow;
            if (t < 0.15) glow = t / 0.15;
            else glow = 1 - ((t - 0.15) / 0.85);
            glow = glow * glow * (3 - 2 * glow);

            this._draw(false, glow);

            if (t < 1) {
                this._animFrame = requestAnimationFrame(tick);
            } else {
                this._animFrame = null;
                this._draw(false, 0);
            }
        };

        this._animFrame = requestAnimationFrame(tick);
        this.canvas.dispatchEvent(new CustomEvent('sigil-generated'));
    }

    /* ====================================================
       Shape vertices
    ==================================================== */

    /**
     * Get vertices for any named shape at given size.
     */
    _getVerticesForShape(shapeName, size) {
        const cx = size / 2, cy = size / 2;
        const r = (size * SigilGenerator.SHAPE_RATIO) / 2;

        switch (shapeName) {
            case 'circle':        return []; // handled separately
            case 'square':        return this._regularPolygon(cx, cy, r, 4, -Math.PI / 4);
            case 'triangle':      return this._regularPolygon(cx, cy, r, 3, -Math.PI / 2);
            case 'diamond':       return this._regularPolygon(cx, cy, r, 4, -Math.PI / 2);
            case 'pentagon':      return this._regularPolygon(cx, cy, r, 5, -Math.PI / 2);
            case 'hexagon':       return this._regularPolygon(cx, cy, r, 6, -Math.PI / 2);
            case 'octagon':       return this._regularPolygon(cx, cy, r, 8, -Math.PI / 8);
            case 'star':          return this._starPolygon(cx, cy, r, r * 0.50, 5, -Math.PI / 2);
            case 'star-inverted': return this._starPolygon(cx, cy, r, r * 0.50, 5, Math.PI / 2);
            case 'random':        return this._getRandomShapeVertices(cx, cy, r);
            default:              return [];
        }
    }

    _getShapeVertices(size) {
        return this._getVerticesForShape(this.shape, size);
    }

    /**
     * Generate a random polygon: 4-8 vertices at random angles and distances,
     * sorted by angle to prevent self-intersection.
     * Returns normalised data (angles + radii as fractions of max radius)
     * that can be scaled to any size later.
     */
    _generateRandomPolygon() {
        const n = 4 + Math.floor(Math.random() * 5); // 4-8 vertices
        const points = [];
        for (let i = 0; i < n; i++) {
            points.push({
                angle: Math.random() * Math.PI * 2,
                radius: 0.55 + Math.random() * 0.45 // 55-100% of max radius for variety but not too small
            });
        }
        // Sort by angle so edges don't cross
        points.sort((a, b) => a.angle - b.angle);
        return points;
    }

    /**
     * Convert stored random polygon data to vertices at given size.
     */
    _getRandomShapeVertices(cx, cy, r) {
        if (!this._randomVertices) return this._regularPolygon(cx, cy, r, 5, -Math.PI / 2); // fallback
        return this._randomVertices.map(p => ({
            x: cx + r * p.radius * Math.cos(p.angle),
            y: cy + r * p.radius * Math.sin(p.angle)
        }));
    }

    _regularPolygon(cx, cy, r, sides, startAngle = 0) {
        const v = [];
        for (let i = 0; i < sides; i++) {
            const a = startAngle + (Math.PI * 2 * i) / sides;
            v.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
        return v;
    }

    _starPolygon(cx, cy, outerR, innerR, points, startAngle = -Math.PI / 2) {
        const v = [];
        for (let i = 0; i < points * 2; i++) {
            const a = startAngle + (Math.PI * i) / points;
            const rad = i % 2 === 0 ? outerR : innerR;
            v.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
        }
        return v;
    }

    /* ====================================================
       Random point in shape (rejection sampling)
    ==================================================== */

    _randomPointInShape() {
        if (this.shape === 'circle') {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random());
            return { nx: 0.5 + r * 0.5 * Math.cos(angle), ny: 0.5 + r * 0.5 * Math.sin(angle) };
        }
        const testVerts = this._getShapeVertices(1000);
        const bounds = this._getBounds(testVerts);
        for (let i = 0; i < 1000; i++) {
            const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
            const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
            if (this._pointInPolygon(x, y, testVerts)) {
                return {
                    nx: (x - bounds.minX) / (bounds.maxX - bounds.minX),
                    ny: (y - bounds.minY) / (bounds.maxY - bounds.minY)
                };
            }
        }
        return { nx: 0.5, ny: 0.5 };
    }

    /* ====================================================
       Geometry helpers
    ==================================================== */

    _getBounds(vertices) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const v of vertices) {
            if (v.x < minX) minX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x;
            if (v.y > maxY) maxY = v.y;
        }
        return { minX, minY, maxX, maxY };
    }

    _pointInPolygon(px, py, vertices) {
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x, yi = vertices[i].y;
            const xj = vertices[j].x, yj = vertices[j].y;
            if ((yi > py) !== (yj > py) &&
                px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }
}
