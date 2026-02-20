/**
 * App — wires up the UI controls to the SigilGenerator.
 */
(function () {
    'use strict';

    const canvas = document.getElementById('sigilCanvas');
    const sigil = new SigilGenerator(canvas);

    // --- Custom shape dropdown ---
    const selectTrigger = document.getElementById('shapeSelectTrigger');
    const selectOptions = document.getElementById('shapeSelectOptions');
    const options = selectOptions.querySelectorAll('.custom-select-option');

    selectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        selectOptions.classList.toggle('open');
        selectTrigger.classList.toggle('open');
    });

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            sigil.shape = opt.dataset.value;

            // Update trigger display
            const icon = opt.querySelector('.shape-icon').cloneNode(true);
            const label = opt.querySelector('span').textContent;
            const triggerIcon = selectTrigger.querySelector('.shape-icon');
            const triggerLabel = selectTrigger.querySelector('span');
            triggerIcon.replaceWith(icon);
            triggerLabel.textContent = label;

            selectOptions.classList.remove('open');
            selectTrigger.classList.remove('open');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        selectOptions.classList.remove('open');
        selectTrigger.classList.remove('open');
    });

    // --- Color pickers ---
    const bgColorInput = document.getElementById('bgColor');
    const bgColorHex = document.getElementById('bgColorHex');
    const sigilColorInput = document.getElementById('sigilColor');
    const sigilColorHex = document.getElementById('sigilColorHex');

    bgColorInput.addEventListener('input', () => {
        sigil.bgColor = bgColorInput.value;
        bgColorHex.textContent = bgColorInput.value;
    });

    sigilColorInput.addEventListener('input', () => {
        sigil.sigilColor = sigilColorInput.value;
        sigilColorHex.textContent = sigilColorInput.value;
    });

    // --- Complexity slider ---
    const complexityInput = document.getElementById('complexity');
    const complexityValue = document.getElementById('complexityValue');

    complexityInput.addEventListener('input', () => {
        sigil.complexity = parseInt(complexityInput.value, 10);
        complexityValue.textContent = complexityInput.value;
    });

    // --- Generate button ---
    const exportPngBtn = document.getElementById('exportPng');
    const exportSvgBtn = document.getElementById('exportSvg');
    const canvasFrame = document.querySelector('.canvas-frame');

    document.getElementById('generateBtn').addEventListener('click', () => {
        sigil.generate();
        exportPngBtn.disabled = false;
        exportSvgBtn.disabled = false;
    });

    // CSS glow pulse on canvas frame when sigil is generated
    canvas.addEventListener('sigil-generated', () => {
        canvasFrame.classList.remove('glow-pulse');
        // Force reflow to restart animation
        void canvasFrame.offsetWidth;
        canvasFrame.classList.add('glow-pulse');
    });

    // --- Transparent background checkbox ---
    const transparentBg = document.getElementById('transparentBg');

    // --- Export PNG ---
    document.getElementById('exportPng').addEventListener('click', () => {
        const dataUrl = sigil.exportPNG(transparentBg.checked);
        downloadFile(dataUrl, 'sigil.png');
    });

    // --- Export SVG ---
    document.getElementById('exportSvg').addEventListener('click', () => {
        const svgString = sigil.exportSVG(transparentBg.checked);
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        downloadFile(url, 'sigil.svg');
        URL.revokeObjectURL(url);
    });

    // --- Helper: trigger a file download ---
    function downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // --- Draw empty canvas on load (no sigil yet) ---
    sigil.drawEmpty();
})();
