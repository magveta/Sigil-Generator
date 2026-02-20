/**
 * Constellation Web — animated background with drifting nodes
 * connected by faint lines when close enough.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('constellationBg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    /* ---- Configuration ---- */
    const NODE_COUNT      = 80;
    const CONNECT_DIST    = 160;   // px — max distance to draw a line
    const NODE_SPEED      = 0.25;  // px/frame base speed
    const NODE_RADIUS_MIN = 1;
    const NODE_RADIUS_MAX = 2.2;
    const LINE_COLOR      = 'rgba(180, 20, 20, ';   // alpha appended dynamically
    const NODE_COLOR      = 'rgba(200, 40, 40, 0.7)';
    const NODE_GLOW_COLOR = 'rgba(200, 0, 0, 0.25)';

    let width, height;
    let nodes = [];
    let animId = null;

    /* ---- Node class ---- */
    class Node {
        constructor() {
            this.x  = Math.random() * width;
            this.y  = Math.random() * height;
            this.vx = (Math.random() - 0.5) * NODE_SPEED * 2;
            this.vy = (Math.random() - 0.5) * NODE_SPEED * 2;
            this.r  = NODE_RADIUS_MIN + Math.random() * (NODE_RADIUS_MAX - NODE_RADIUS_MIN);
            // Subtle pulsing
            this.pulseSpeed  = 0.005 + Math.random() * 0.01;
            this.pulseOffset = Math.random() * Math.PI * 2;
        }

        update(time) {
            this.x += this.vx;
            this.y += this.vy;

            // Wrap around edges with a small buffer
            const buf = 20;
            if (this.x < -buf) this.x = width + buf;
            if (this.x > width + buf) this.x = -buf;
            if (this.y < -buf) this.y = height + buf;
            if (this.y > height + buf) this.y = -buf;

            // Pulse radius
            this.currentR = this.r * (0.8 + 0.4 * Math.sin(time * this.pulseSpeed + this.pulseOffset));
        }
    }

    /* ---- Setup ---- */
    function resize() {
        width  = window.innerWidth;
        height = window.innerHeight;
        canvas.width  = width;
        canvas.height = height;

        // Re-populate if node count changed significantly
        if (nodes.length === 0) {
            for (let i = 0; i < NODE_COUNT; i++) {
                nodes.push(new Node());
            }
        }
    }

    /* ---- Draw frame ---- */
    function draw(time) {
        ctx.clearRect(0, 0, width, height);

        // Update nodes
        for (const n of nodes) n.update(time);

        // Draw connections
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < CONNECT_DIST) {
                    const alpha = (1 - dist / CONNECT_DIST) * 0.18;
                    ctx.strokeStyle = LINE_COLOR + alpha.toFixed(3) + ')';
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.stroke();
                }
            }
        }

        // Draw nodes
        for (const n of nodes) {
            // Glow
            ctx.shadowColor = NODE_GLOW_COLOR;
            ctx.shadowBlur  = 8;
            ctx.fillStyle   = NODE_COLOR;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.currentR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur  = 0;

        animId = requestAnimationFrame(draw);
    }

    /* ---- Init ---- */
    resize();
    window.addEventListener('resize', resize);
    animId = requestAnimationFrame(draw);
})();
