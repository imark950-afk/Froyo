// Minimal QR code generator for short member codes (version 2, error correction M, byte mode).
// No dependencies, so no third-party code runs on the page. Holds up to 26 bytes.
(function (root) {
  "use strict";
  var EXP = new Array(512), LOG = new Array(256);
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function gmul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function rsEncode(data, ecLen) {
    var gen = [1];
    for (var i = 0; i < ecLen; i++) {
      var next = new Array(gen.length + 1).fill(0);
      for (var j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= gmul(gen[j], EXP[i]); }
      gen = next;
    }
    var res = data.concat(new Array(ecLen).fill(0));
    for (i = 0; i < data.length; i++) {
      var c = res[i];
      if (c) for (j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], c);
    }
    return res.slice(data.length);
  }
  var VERSION = 2, SIZE = 25, DATA_CW = 28, EC_CW = 16, EC_BITS = 0; // level M = 0b00
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
  function bitsOf(bytes) {
    var bits = [];
    function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4); put(bytes.length, 8); bytes.forEach(function (b) { put(b, 8); });
    var cap = DATA_CW * 8;
    for (var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var k = 0; k < 8; k++) v = (v << 1) | bits[i + k]; cw.push(v); }
    for (var p = 0; cw.length < DATA_CW; p++) cw.push(p % 2 ? 0x11 : 0xec);
    return cw;
  }
  function bchFormat(data) {
    var d = data << 10, g = 0x537;
    for (var i = 14; i >= 10; i--) if (d & (1 << i)) d ^= g << (i - 10);
    return ((data << 10) | d) ^ 0x5412;
  }
  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; }, function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; }, function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];
  function build(codewords, mask) {
    var m = [], fixed = [];
    for (var r = 0; r < SIZE; r++) { m.push(new Array(SIZE).fill(false)); fixed.push(new Array(SIZE).fill(false)); }
    function set(r, c, v) { m[r][c] = v; fixed[r][c] = true; }
    function finder(r0, c0) {
      for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
        var rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) continue;
        var on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(rr, cc, on);
      }
    }
    finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);
    for (var i = 8; i < SIZE - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    for (r = -2; r <= 2; r++) for (var c = -2; c <= 2; c++) set(18 + r, 18 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
    set(SIZE - 8, 8, true); // dark module
    var fmt = bchFormat((EC_BITS << 3) | mask);
    for (i = 0; i < 15; i++) {
      var bit = ((fmt >> i) & 1) === 1;
      if (i < 6) set(i, 8, bit); else if (i < 8) set(i + 1, 8, bit); else set(SIZE - 15 + i, 8, bit);
      if (i < 8) set(8, SIZE - i - 1, bit); else if (i < 9) set(8, 15 - i - 1 + 1, bit); else set(8, 15 - i - 1, bit);
    }
    var bits = [];
    codewords.forEach(function (b) { for (var k = 7; k >= 0; k--) bits.push((b >> k) & 1); });
    var idx = 0, up = true;
    for (var col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var n = 0; n < SIZE; n++) {
        r = up ? SIZE - 1 - n : n;
        for (var k2 = 0; k2 < 2; k2++) {
          c = col - k2;
          if (fixed[r][c]) continue;
          var v = idx < bits.length ? bits[idx] === 1 : false; idx++;
          if (MASKS[mask](r, c)) v = !v;
          m[r][c] = v;
        }
      }
      up = !up;
    }
    return m;
  }
  function penalty(m) {
    var s = 0, r, c, n = SIZE;
    for (r = 0; r < n; r++) for (var dir = 0; dir < 2; dir++) {
      var run = 1;
      for (c = 1; c < n; c++) {
        var a = dir ? m[c][r] : m[r][c], b = dir ? m[c - 1][r] : m[r][c - 1];
        if (a === b) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1;
      }
    }
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) { var v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) s += 3; }
    var dark = 0; for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (m[r][c]) dark++;
    s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    return s;
  }
  function matrix(text, forceMask) {
    var bytes = utf8(text);
    if (bytes.length > 26) throw new Error("QR text too long");
    var data = bitsOf(bytes);
    var all = data.concat(rsEncode(data, EC_CW));
    if (forceMask !== undefined) return build(all, forceMask);
    var best = null, bestScore = Infinity;
    for (var k = 0; k < 8; k++) { var mm = build(all, k), sc = penalty(mm); if (sc < bestScore) { best = mm; bestScore = sc; } }
    return best;
  }
  function svg(text, label) {
    var m = matrix(text), q = 2, n = SIZE + q * 2, d = "";
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (m[r][c]) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" width="106" height="106" shape-rendering="crispEdges" role="img" aria-label="' + (label || "QR code") + '"><rect width="100%" height="100%" fill="#fff"/><path fill="#121212" d="' + d + '"/></svg>';
  }
  root.FroyoQR = { matrix: matrix, svg: svg };
})(typeof window !== "undefined" ? window : globalThis);
