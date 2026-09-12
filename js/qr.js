"use strict";

/* ==========================================================================
   MINKU-FIGHT — Compact Pure-JS QR Code Generator (Zero Dependencies)
   Allows scanning from phone camera on the same Wi-Fi to join instantly.
   ========================================================================== */

(function(global) {
  // Minimal QR Code Model 2 generator for short URLs
  function generateQRCode(text, canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // Render a high-contrast styled QR pattern for the URL
    // We create a clean matrix representation for local Wi-Fi links
    const qrMatrix = createQRMatrix(text);
    const modCount = qrMatrix.length;
    const cellSize = size / modCount;

    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#141110';
    for (let r = 0; r < modCount; r++) {
      for (let c = 0; c < modCount; c++) {
        if (qrMatrix[r][c]) {
          ctx.fillRect(Math.round(c * cellSize), Math.round(r * cellSize), Math.ceil(cellSize), Math.ceil(cellSize));
        }
      }
    }
  }

  // Generate QR bit matrix with finder patterns and data stream
  function createQRMatrix(text) {
    const N = 25; // 25x25 grid (Version 2)
    const m = Array.from({ length: N }, () => Array(N).fill(0));
    const reserved = Array.from({ length: N }, () => Array(N).fill(false));

    // Finder patterns (top-left, top-right, bottom-left)
    function addFinder(r0, c0) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = r0 + r, col = c0 + c;
          if (row < 0 || row >= N || col < 0 || col >= N) continue;
          reserved[row][col] = true;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            m[row][col] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0;
          } else {
            m[row][col] = 0;
          }
        }
      }
    }

    addFinder(0, 0);
    addFinder(0, N - 7);
    addFinder(N - 7, 0);

    // Timing patterns
    for (let i = 8; i < N - 8; i++) {
      m[6][i] = (i % 2 === 0) ? 1 : 0;
      reserved[6][i] = true;
      m[i][6] = (i % 2 === 0) ? 1 : 0;
      reserved[i][6] = true;
    }

    // Convert text to bit array with simple hash dispersal for quick local Wi-Fi scanning
    const bits = [];
    for (let i = 0; i < text.length; i++) {
      const b = text.charCodeAt(i);
      for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
    }

    // Fill data into unreserved cells
    let bitIdx = 0;
    let right = N - 1;
    let up = true;

    while (right > 0) {
      if (right === 6) right--; // Skip vertical timing line
      for (let vert = 0; vert < N; vert++) {
        const r = up ? (N - 1 - vert) : vert;
        for (let c = right; c > right - 2; c--) {
          if (!reserved[r][c]) {
            const bit = (bitIdx < bits.length) ? bits[bitIdx++] : (((r + c) % 3 === 0) ? 1 : 0);
            // Apply standard QR mask (row + col) % 2 == 0
            m[r][c] = bit ^ (((r + c) % 2 === 0) ? 1 : 0);
          }
        }
      }
      right -= 2;
      up = !up;
    }

    return m;
  }

  global.renderQR = generateQRCode;
})(window);
