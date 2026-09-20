// String Grip — fingering + playability engine
// Pure JavaScript, no MuseScore dependencies. Loaded by the extension's QML
// (import "engine.js" as Engine) and by the Node test-suite.
//
// Model
//  - Every note gets a string and a fret (semitones above the open string).
//    Fret 0 = open string: needs no finger, so it never counts towards a grip.
//  - A chord (notes attacked together in one voice) must put each note on its
//    own string. Bowed: the strings must be neighbours. Pizz: any strings.
//  - Grip span = distance between the lowest and highest stopped fret the hand
//    has to cover at once. Measured in semitones (default) or in millimetres
//    along the string (physical: the same interval gets shorter higher up).
//  - Shifts are found, not graded: every shift is olive and counts the same
//    in the search, so the chosen fingering has as few shifts as possible.
//  - The hand frame is what the hand has covered since its last shift
//    (always at least the previous two notes). A note that would widen it past
//    the normal span means the hand must move -> "shift". Catches gradual
//    stepwise creep that a fixed 3-note window would miss.
//  - The whole line is fingered with a Viterbi search over (string choice,
//    hand frame), so strings are
//    chosen to avoid shifts, string skips and stretches where an alternative
//    exists. Only problems that survive the best fingering are reported.
//
// Levels: 0 = fine, 1 = OLIVE (stretch / extension / shift / awkward),
// 2 = AMBER (hard - professionals can), 3 = RED (impossible as written).

var OK = 0, OLIVE = 1, AMBER = 2, RED = 3;
var BEAM = 128;  // hand states kept per note (see analyse); 128 = no change vs unpruned on 300 random passages

// ============================================================================
// GRADE-LEVEL REFERENCE (researched 2026-09-19) - basis for the colours below and
// for a future target-level checker. Not code: notes for whoever extends this.
//
// Sources
//   ASTA   ASTA string syllabus grade summary
//          https://stringorchestrasheetmusic.com/wp-content/uploads/2015/05/ASTA-GRADING-SYSTEM.pdf
//   ALFRED Alfred Music string orchestra submission guidelines
//          https://images.alfred.com/submissions/orchestra-guidelines.pdf
//   SHAR   SHAR Music difficulty ratings (A1-A6 / ASTA 1-6)
//          https://www.sharmusic.com/pages/sheet-music-difficulty-ratings
//   ASTACAP ASTA Certificate Advancement Program levels (cello, bass)
//          https://bairdd.wixsite.com/celloandabass/asta-advancement-levels
//
// Grade 1/2 (ALFRED)  violin, viola, cello: no extensions. Bass: 1st position.
// Grade 1   (ASTA)    "left hand usually remains in the first position"; keys G D A C.
//           (ALFRED)  no extensions, except violin low 1 on the E string.
//                     Bass: 1st and 3rd positions.
//           (SHAR)    cello: "infrequent use of extensions".
// Grade 2   (ALFRED)  violin, viola, cello: "1st through 3rd positions with all
//                     extensions"; bass "1st through 4th positions with all extensions";
//                     double stops appear.
//           (ASTA)    "passages in third position are possible"; "shifting is rare".
//           (SHAR)    violin: "some third position but no rapid shifting";
//                     cello: "second and third position", "extensions used frequently
//                     in first position". Bass (grades 1-2): half and first position,
//                     up to third.
// Grade 3   (ALFRED)  "All strings - 1st through 5th positions".
//           (ASTA)    "first three positions, with some use of positions (violins up to
//                     5th; violas up to 3rd; cello & tenor clef up to 7th)";
//                     "build fluency in shifting".
//           (SHAR)    violin: "simple double stops and chords", up to 5th position;
//                     cello: "upper positions are used extensively", double stops.
//                     Bass (grades 3-4): "third and higher positions, including thumb".
// Grade 4   (ASTA)    "first five positions are used freely (cello includes thumb
//                     position)"; "double stops and chords appear more frequently".
//           (ASTACAP) cello level 4: first four positions + some fifth; broken thirds,
//                     double-stopped thirds and sixths.
// Grade 5   (ASTA)    "higher positions on all four strings", "large leaps",
//                     "extended passages in double stops".
//           (SHAR)    "double stops, large leaps, and octaves"; cello thumb position.
// Grade 6   (ALFRED)  "as needed for content"; everything by musical context.
//
// Hand frames used to turn the guides into fret ranges (standard technique):
//   violin/viola  closed hand = perfect 4th (5 semitones), 1st to 4th finger;
//                 extension = low 1 or high 4 (+1); first position = frets 2-7
//                 (fret 7 = next string open, except the top string).
//   cello         closed = minor 3rd (3), extended = major 3rd (4).
//   double bass   Simandl = whole tone (2), extended / pivot = minor 3rd (3).
//
// What the guides DON'T define (kept as fixed flags, not graded):
//   shift distance (only "large leaps" = grade 5), speed, double-stop span
//   (they grade by type: open-string, 3rds, 6ths, octaves, tenths), bass above
//   grade 4, and grades 5-6 beyond "as needed".
//
// Current calibration = a grade-3 slice of this:
//   olive = grade-3 maximum: a grade-3 ensemble can play it, but it should not
//           dominate a grade-3 piece (grades 1-2 are beginner level) - Alfons
//   amber = the highest clearly defined grip limit (professional level), only
//           justified by "what the piece needs" - Alfons
//   red   = beyond professional level: masters maybe, or not playable at all - Alfons
//
// FUTURE - target-level checker (Alfons, 2026-09-19, not built):
//   choose a target grade; each finding gets a "required grade" from a
//   per-instrument x per-grade table built from the notes above; colour =
//   olive at the target, amber above it, red for not reasonably playable.
//   Skills the grades don't define keep their own fixed flags. Open question:
//   does olive mean "at the top of the target" or "just above it"?
//   The per-finding codes below (extension, prostretch, stretch, pro, span, pos,
//   shift, skip, samestring, broken, low, high) are the hooks to grade.
//   Could share the table with the per-bar difficulty grader (~/score-difficulty).
// ============================================================================

// Every limit is a FRET RANGE as Alfons describes it, with fret 0 (the nut) counted as a
// physical fret. Semitone mode uses hi - lo; millimetre mode uses the real distance
// between those two fret positions, so the same hand covers more frets higher up.
//
// Calibrated to string-orchestra grades (ASTA / Alfred / SHAR): OLIVE = grade-3 maximum
// (playable by a grade-3 ensemble, but shouldn't dominate a grade-3 piece); AMBER = the
// highest clearly defined grip limit (professional, "what the piece needs").
// Standard extensions are grade-2 material, so they are NOT flagged.
// fit      = no flag: closed hand + one normal extension
//            (violin/viola 1-7 or 2-8, cello 1-5 or 2-6, bass 1-4)
// stretch  = olive "extension", still no shift (violin/viola up to 0-9, cello 1-6, bass 1-5).
//            Past it a line normally shifts (olive).
// proStretch = amber line stretch, only used when the notes are FAST and the stretch
//            saves shifting out and straight back (cello 1-7). Same as stretch = none.
// chordOk / chordMax / chordPro = double stop no flag / olive / amber; beyond = red.
//            Violin/viola: 3rds, 6ths, open strings fine; octave olive (grade 5); tenths amber.
//            Cello 1-5 / 1-6 / 1-7, bass 1-3 / 1-4 / 1-5 (Alfons).
// highFret = olive above the grade-3 positions: violin 5th pos (4th finger ~14),
//            viola 3rd pos (~10, ASTA), cello below thumb (12), bass 12.
var PROFILES = {
    violin:   { label: "Violin",       strings: [55, 62, 69, 76], scaleMm: 328,  maxFret: 22, highFret: 14, fit: [2, 8], stretch: [0, 9], proStretch: [0, 9], chordOk: [2, 6], chordMax: [2, 8], chordPro: [0, 9], bowed: true },
    viola:    { label: "Viola",        strings: [48, 55, 62, 69], scaleMm: 370,  maxFret: 20, highFret: 10, fit: [2, 8], stretch: [0, 9], proStretch: [0, 9], chordOk: [2, 6], chordMax: [2, 8], chordPro: [0, 9], bowed: true },
    cello:    { label: "Cello",        strings: [36, 43, 50, 57], scaleMm: 690,  maxFret: 24, highFret: 12, fit: [1, 5], stretch: [1, 6], proStretch: [1, 7], chordOk: [1, 5], chordMax: [1, 6], chordPro: [1, 7], bowed: true },
    bass:     { label: "Double bass",  strings: [28, 33, 38, 43], scaleMm: 1060, maxFret: 24, highFret: 12, fit: [1, 4], stretch: [1, 5], proStretch: [1, 5], chordOk: [1, 3], chordMax: [1, 4], chordPro: [1, 5], bowed: true,  writtenOffset: 12 },
    ebass:    { label: "Electric bass",strings: [28, 33, 38, 43], scaleMm: 864,  maxFret: 20, highFret: 12, fit: [1, 4], stretch: [1, 4], proStretch: [1, 4], chordOk: [1, 4], chordMax: [1, 6], chordPro: [1, 7], bowed: false, writtenOffset: 12 },
    guitar:   { label: "Guitar",       strings: [40, 45, 50, 55, 59, 64], scaleMm: 648, maxFret: 22, highFret: 12, fit: [1, 4], stretch: [1, 4], proStretch: [1, 4], chordOk: [1, 4], chordMax: [1, 6], chordPro: [1, 7], bowed: false }
};

// Map a MuseScore instrumentId / part name to a profile key. Handles the
// Swedish names used in the score (Violoncell, Kontrabas, Elbas, Elgitarr).
function detectProfile(instrumentId, name) {
    var s = ((instrumentId || "") + " " + (name || "")).toLowerCase();
    if (/viola|altfiol|bratsch/.test(s)) return "viola";
    if (/violoncell|cello/.test(s)) return "cello";
    if (/contrabass|double.?bass|kontraba|string.?bass|upright/.test(s)) return "bass";
    if (/electric.?bass|bass.?guitar|elbas|fretless|basgitarr/.test(s)) return "ebass";
    if (/violin|fiol/.test(s)) return "violin";
    if (/guitar|gitarr/.test(s)) return "guitar";
    return null;
}

function defaultOptions() {
    return {
        unit: "semitones",   // "semitones" | "mm"
        chords: true,        // double/multiple stops
        shifts: true,        // regular shifts (3-note look-back)
        range: true,         // below the lowest string / above the fingerboard / high positions
        fastMs: 180,         // only steers string choice (avoid string skips in fast passages)
        resetMs: 400,        // a silence at least this long lets the hand reset freely
        crossVoices: false   // unused by the engine itself: the caller merges voices
    };
}

function mergeOptions(o) {
    var d = defaultOptions();
    if (o) for (var k in o) if (o[k] !== undefined) d[k] = o[k];
    return d;
}

// ---------------------------------------------------------------- distances

function makeMeasure(prof, opts) {
    var L = prof.scaleMm;
    function pos(f) { return L * (1 - Math.pow(2, -f / 12)); }
    var mm = opts.unit === "mm";
    // A limit is a fret range [lo, hi] (fret 0 = nut, a physical fret): semitones
    // hi - lo, or the real distance between the two fret positions in mm.
    function thr(r) { return mm ? pos(r[1]) - pos(r[0]) : r[1] - r[0]; }
    return {
        mm: mm,
        dist: function (a, b) { return mm ? Math.abs(pos(a) - pos(b)) : Math.abs(a - b); },
        normal: thr(prof.fit),
        stretch: thr(prof.stretch),
        proStretch: thr(prof.proStretch || prof.stretch),
        chordOk: thr(prof.chordOk),
        chordMax: thr(prof.chordMax),
        chordPro: thr(prof.chordPro),
        fmt: function (v) { return mm ? Math.round(v) + " mm" : Math.round(v) + (Math.round(v) === 1 ? " semitone" : " semitones"); }
    };
}

function spanOf(frets, M) {
    if (!frets.length) return 0;
    var lo = frets[0], hi = frets[0];
    for (var i = 1; i < frets.length; i++) { if (frets[i] < lo) lo = frets[i]; if (frets[i] > hi) hi = frets[i]; }
    return M.dist(lo, hi);
}

function stopped(c) {
    var r = [];
    for (var i = 0; i < c.frets.length; i++) if (c.frets[i] > 0) r.push(c.frets[i]);
    return r;
}

var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pitchName(p) { return NOTE_NAMES[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1); }

// ---------------------------------------------------------------- candidates

// All ways to put the chord's notes on distinct strings, in range.
function enumerate(pitches, prof) {
    var out = [];
    var n = prof.strings.length;
    var cur = [];
    var used = [];
    for (var u = 0; u < n; u++) used.push(false);
    function rec(i) {
        if (i === pitches.length) { out.push(cur.slice()); return; }
        for (var s = 0; s < n; s++) {
            if (used[s]) continue;
            var f = pitches[i] - prof.strings[s];
            if (f < 0 || f > prof.maxFret) continue;
            used[s] = true; cur.push(s);
            rec(i + 1);
            cur.pop(); used[s] = false;
            if (out.length > 400) return;
        }
    }
    if (pitches.length <= n) rec(0);
    return out;
}

// Best-effort placement when no legal assignment exists: each note on the
// highest string it fits (or nearest), duplicates allowed. Flags explain why.
function fallback(pitches, prof) {
    var s = [];
    for (var i = 0; i < pitches.length; i++) {
        var best = 0;
        for (var k = 0; k < prof.strings.length; k++) if (pitches[i] >= prof.strings[k]) best = k;
        s.push(best);
    }
    return s;
}

function evaluate(ev, strs, prof, M, opts, legal) {
    var frets = [], flags = [], cost = 0;
    for (var i = 0; i < ev.pitches.length; i++) frets.push(ev.pitches[i] - prof.strings[strs[i]]);
    var c = { strings: strs, frets: frets, flags: flags, cost: 0 };
    var bowed = prof.bowed && !ev.pizz;

    // range
    for (i = 0; i < ev.pitches.length; i++) {
        if (frets[i] < 0) {
            if (opts.range) flags.push({ level: RED, note: i, code: "low", msg: pitchName(ev.pitches[i]) + " is below the lowest string" });
            cost += 60;
        } else if (frets[i] > prof.maxFret) {
            if (opts.range) flags.push({ level: RED, note: i, code: "high", msg: pitchName(ev.pitches[i]) + " is off the end of the fingerboard" });
            cost += 60;
        } else if (frets[i] > prof.highFret) {
            if (opts.range) flags.push({ level: OLIVE, note: i, code: "pos", msg: pitchName(ev.pitches[i]) + " needs a high position (fret " + frets[i] + ")" });
            cost += 0.6;
        }
    }

    if (ev.pitches.length > 1) {
        if (!legal) {
            if (ev.pitches.length > prof.strings.length) {
                if (opts.chords) flags.push({ level: RED, note: -1, code: "count", msg: ev.pitches.length + " notes but only " + prof.strings.length + " strings" });
            } else if (opts.chords) {
                flags.push({ level: RED, note: -1, code: "samestring", msg: "no way to put " + ev.pitches.map(pitchName).join("+") + " on separate strings" });
            }
            cost += 80;
        } else {
            var sorted = strs.slice().sort(function (a, b) { return a - b; });
            var contiguous = true;
            for (i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) contiguous = false;
            if (bowed && !contiguous) {
                if (opts.chords) flags.push({ level: RED, note: -1, code: "skip", msg: "strings not adjacent – cannot be bowed together" });
                cost += 40;
            }
            if (bowed && ev.pitches.length >= 3) {
                if (opts.chords) flags.push({ level: OLIVE, note: -1, code: "broken", msg: ev.pitches.length + "-note chord – must be broken/rolled when bowed" });
            }
            var sp = spanOf(stopped(c), M);
            if (sp > M.chordPro) {
                if (opts.chords) flags.push({ level: RED, note: -1, code: "span", msg: "double-stop span " + M.fmt(sp) + " – beyond reach (limit " + M.fmt(M.chordPro) + ")" });
                cost += 40;
            } else if (sp > M.chordMax) {
                if (opts.chords) flags.push({ level: AMBER, note: -1, code: "pro", msg: "double-stop span " + M.fmt(sp) + " – hard, professionals can (olive limit " + M.fmt(M.chordMax) + ")" });
                cost += 12;
            } else if (sp > M.chordOk) {
                if (opts.chords) flags.push({ level: OLIVE, note: -1, code: "stretch", msg: "double-stop span " + M.fmt(sp) + " – stretch (comfortable " + M.fmt(M.chordOk) + ")" });
                cost += 2 + 3 * (sp - M.chordOk) / M.normal;
            }
        }
    }

    // mild preferences: lower positions, fewer stopped notes on fast passages
    var sum = 0;
    for (i = 0; i < frets.length; i++) sum += Math.max(0, frets[i]);
    cost += 0.04 * sum / frets.length;
    c.cost = cost;
    return c;
}

// A fingering already in the score (string per note, low->high index). Used as the
// only candidate for that event, so the score's own fingering can be evaluated.
function fixedCandidate(ev, strs, prof, M, opts) {
    if (!strs || strs.length !== ev.pitches.length) return null;
    var seen = {};
    for (var i = 0; i < strs.length; i++) {
        var st = strs[i];
        if (st === null || st === undefined || st < 0 || st >= prof.strings.length) return null;
        var f = ev.pitches[i] - prof.strings[st];
        if (f < 0 || f > prof.maxFret) return null;
        seen[st] = (seen[st] || 0) + 1;
    }
    var legal = true;
    for (var k in seen) if (seen[k] > 1) legal = false;
    return evaluate(ev, strs.slice(), prof, M, opts, legal);
}

function candidatesFor(ev, prof, M, opts) {
    var sets = enumerate(ev.pitches, prof);
    var out = [];
    for (var i = 0; i < sets.length; i++) out.push(evaluate(ev, sets[i], prof, M, opts, true));
    if (!out.length) out.push(evaluate(ev, fallback(ev.pitches, prof), prof, M, opts, false));
    return out;
}

// ---------------------------------------------------------------- transitions

function lowestString(c) {
    var m = 99;
    for (var i = 0; i < c.strings.length; i++) if (c.strings[i] < m) m = c.strings[i];
    return m;
}

// Hand-frame model. The frame is the range of stopped frets the hand has
// covered since its last shift (so it always contains at least the previous
// two notes – the "look back two notes" rule – and keeps growing while the
// hand stays put). A new note that would widen it past the normal span means
// the hand has to move: a shift. After a shift the frame restarts from the
// new note (plus the previous note when both fit one position).
function lohi(frets) {
    var lo = 99, hi = -1;
    for (var i = 0; i < frets.length; i++) { if (frets[i] < lo) lo = frets[i]; if (frets[i] > hi) hi = frets[i]; }
    return hi < 0 ? null : [lo, hi];
}

function union(a, b) {
    if (!a) return b; if (!b) return a;
    return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

// Two measures of the hand (Alfons: cello "1-5 or 2-6" is free, the hand slides):
//   recent = frets of the previous two notes. recent + this note = what the hand has
//            to HOLD right now -> decides whether this note is a stretch (olive).
//   frame  = every fret used since the last shift. Sliding between 1-5 and 2-6 stays
//            inside the stretch range (cello 1-6) -> not a shift. Past it the hand
//            has really moved -> shift.
// Returns every valid option; the search picks (so "stretch vs shift" is decided by
// what comes after - shifting out and straight back costs two shifts).
// [{ frame, recent, shift: null | { excess }, ext: null | { width, pro } }, ...]
function step(frame, recent, prevC, c, M, fast) {
    var s = lohi(stopped(c));
    var ps = prevC ? lohi(stopped(prevC)) : null;
    var newRecent = union(ps, s) || recent;
    if (!s) return [{ frame: frame, recent: newRecent, shift: null, ext: null }];
    if (!frame) return [{ frame: s, recent: newRecent, shift: null, ext: null }];
    var local = union(recent, s), lw = M.dist(local[0], local[1]);
    var acc = union(frame, s), aw = M.dist(acc[0], acc[1]);
    var fw = M.dist(frame[0], frame[1]);
    var out = [];
    var shiftOpt = function () {
        var nf = s;
        if (ps) { var u = union(ps, s); if (M.dist(u[0], u[1]) <= M.normal) nf = u; }
        return { frame: nf, recent: newRecent, shift: { excess: aw - Math.max(M.normal, fw) }, ext: null };
    };
    if (aw <= Math.max(M.stretch, fw)) {
        // the hand stays in its range (sliding 1-5 <-> 2-6 is free)
        if (lw <= M.normal || lw <= fw) return [{ frame: acc, recent: newRecent, shift: null, ext: null }];
        // one finger stretches to reach it from the notes it is holding (olive)
        out.push({ frame: acc, recent: newRecent, shift: null, ext: { width: lw, pro: false } });
        out.push(shiftOpt());
        return out;
    }
    // Beyond the range. Fast notes: no time to shift, so a momentary professional
    // stretch (amber) from the notes being held - it only pays off when it saves
    // shifting out and straight back.
    if (fast && lw <= M.proStretch) out.push({ frame: frame, recent: newRecent, shift: null, ext: { width: lw, pro: true } });
    out.push(shiftOpt());
    return out;
}

function lowestString(c) {
    var m = 99;
    for (var i = 0; i < c.strings.length; i++) if (c.strings[i] < m) m = c.strings[i];
    return m;
}

// ---------------------------------------------------------------- main entry

// events: [{ t: onset ms, end: release ms, pitches: [midi...], pizz: bool,
//            restBefore: bool }]  (one voice/player, in time order)
// Returns: [{ strings:[idx low->high], frets:[], level, flags:[{level,note,code,msg}] }]
// fixed: string per note (low->high) per event, or null. Where given, that fingering
// is the ONLY candidate - used to evaluate the score's own fingering as it is.
function analyse(events, profileOrKey, options, fixed) {
    var prof = typeof profileOrKey === "string" ? PROFILES[profileOrKey] : profileOrKey;
    var opts = mergeOptions(options);
    var M = makeMeasure(prof, opts);
    var n = events.length;
    if (!n) return [];

    var C = [];
    for (var i = 0; i < n; i++) {
        var fx = fixed ? fixedCandidate(events[i], fixed[i], prof, M, opts) : null;
        C.push(fx ? [fx] : candidatesFor(events[i], prof, M, opts));
    }

    // Viterbi over states (candidate, hand frame).
    // layer: map key -> { cost, q, frame, back: key in previous layer, shift }
    var layers = [];
    var L0 = {};
    for (var q = 0; q < C[0].length; q++) {
        var f0 = lohi(stopped(C[0][q]));
        var k0 = q + "|" + (f0 ? f0.join(",") : "-") + "|" + (f0 ? f0.join(",") : "-");
        if (!L0[k0] || L0[k0].cost > C[0][q].cost) L0[k0] = { cost: C[0][q].cost, q: q, frame: f0, recent: f0, back: null, shift: null };
    }
    layers.push(L0);

    for (i = 1; i < n; i++) {
        var ev = events[i], evp = events[i - 1];
        var linked = !ev.restBefore && (ev.t - evp.end) < opts.resetMs;
        var dt = ev.t - evp.t;
        var fast = dt < opts.fastMs;
        var bowed = prof.bowed && !ev.pizz;
        var prev = layers[i - 1], cur = {};
        for (var key in prev) {
            var st = prev[key];
            var pc = C[i - 1][st.q];
            for (q = 0; q < C[i].length; q++) {
                var c = C[i][q];
                var base = st.cost + c.cost;
                var extra = 0;
                if (linked && bowed) {
                    var ds = Math.abs(lowestString(c) - lowestString(pc));
                    extra += 0.25 * ds;
                    if (fast && ds > 1) extra += 1.5 * (ds - 1);
                }
                var s0 = lohi(stopped(c));
                var opts2 = linked ? step(st.frame, st.recent, pc, c, M, fast)
                                   : [{ frame: s0, recent: s0, shift: null, ext: null }];
                for (var oi = 0; oi < opts2.length; oi++) {
                    var res = opts2[oi];
                    var cost = base + extra;
                    if (res.ext) cost += res.ext.pro ? 4 : 1;   // olive stretch < shift (3) < amber stretch < two shifts
                    // Every shift counts the same: the search minimises the number of
                    // shifts. Distance is only a tie-breaker.
                    if (res.shift) cost += 3 + 0.01 * res.shift.excess / M.normal;
                    var k = q + "|" + (res.frame ? res.frame.join(",") : "-") + "|" + (res.recent ? res.recent.join(",") : "-");
                    if (!cur[k] || cur[k].cost > cost) cur[k] = { cost: cost, q: q, frame: res.frame, recent: res.recent, back: key, shift: res.shift, ext: res.ext, dt: dt, fast: fast };
                }
            }
        }
        // Beam: keep only the cheapest states. States far behind the best cannot win
        // later (costs only add up), so this keeps big scores fast in MuseScore's
        // slower JS engine without changing results in practice.
        var keys = Object.keys(cur);
        if (keys.length > BEAM) {
            keys.sort(function (a, b) { return cur[a].cost - cur[b].cost; });
            var kept = {};
            for (var bi = 0; bi < BEAM; bi++) kept[keys[bi]] = cur[keys[bi]];
            cur = kept;
        }
        layers.push(cur);
    }

    // backtrack
    var bestKey = null, bestCost = Infinity;
    for (var kk in layers[n - 1]) if (layers[n - 1][kk].cost < bestCost) { bestCost = layers[n - 1][kk].cost; bestKey = kk; }
    var path = new Array(n);
    for (i = n - 1; i >= 0; i--) { path[i] = layers[i][bestKey]; bestKey = path[i].back; }

    // classify
    var out = [];
    for (i = 0; i < n; i++) {
        var s = path[i];
        var cc = C[i][s.q];
        var flags = cc.flags.slice();
        if (s.ext && opts.chords) {
            if (s.ext.pro) flags.push({ level: AMBER, note: -1, code: "prostretch", msg: "stretch instead of shifting out and back – too fast to shift, hard (hand spans " + M.fmt(s.ext.width) + ")" });
            else flags.push({ level: OLIVE, note: -1, code: "extension", msg: "extension – one finger stretches, no shift (hand spans " + M.fmt(s.ext.width) + ")" });
        }
        if (s.shift && opts.shifts) {
            flags.push({ level: OLIVE, note: -1, code: "shift", msg: "shift – outside the hand frame of the previous notes (moves " + M.fmt(s.shift.excess) + ")" });
        }
        var lvl = OK;
        for (var j = 0; j < flags.length; j++) if (flags[j].level > lvl) lvl = flags[j].level;
        out.push({ strings: cc.strings, frets: cc.frets, level: lvl, flags: flags });
    }
    return out;
}

// ---------------------------------------------------------------- keep the score's fingering

// Level weights for comparing fingerings (Alfons): white 0, olive 1, amber 2, red 8
// (red = masters maybe, or unplayable - it weighs much more than amber).
var LEVEL_WEIGHT = [0, 1, 2, 8];

// Split into phrases: a new phrase starts after a rest or a pause long enough for the
// hand to reset (the same rule the search uses).
function phrases(events, opts) {
    var out = [], cur = [];
    for (var i = 0; i < events.length; i++) {
        var linked = i > 0 && !events[i].restBefore && (events[i].t - events[i - 1].end) < opts.resetMs;
        if (!linked && cur.length) { out.push(cur); cur = []; }
        cur.push(i);
    }
    if (cur.length) out.push(cur);
    return out;
}

function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

function phraseScore(res, idx) {
    var sum = 0;
    for (var i = 0; i < idx.length; i++) sum += LEVEL_WEIGHT[res[idx[i]].level];
    return sum * sum;
}

// Keep the fingering already in the score unless the engine finds a better one.
// fixed[i] = string index per note (low->high) from the score, or null when unknown.
// Per phrase: score = (sum of level weights)^2; the engine's fingering replaces the
// score's only when it scores strictly lower. Ties keep the score's fingering.
// Each result gets .source = "kept" | "engine" and .changed (strings differ from fixed).
function analyseKeeping(events, profileOrKey, options, fixed) {
    var opts = mergeOptions(options);
    var free;
    var any = false;
    if (fixed) for (var i = 0; i < fixed.length; i++) if (fixed[i]) { any = true; break; }
    var stats = { phrases: 0, kept: 0, improved: 0, before: 0, after: 0 };
    if (!any) {
        free = analyse(events, profileOrKey, opts);
        for (i = 0; i < free.length; i++) { free[i].source = "engine"; free[i].changed = true; }
        return { results: free, stats: stats };
    }
    var mine = analyse(events, profileOrKey, opts, fixed);
    free = analyse(events, profileOrKey, opts);
    var out = new Array(events.length);
    var ph = phrases(events, opts);
    for (var p = 0; p < ph.length; p++) {
        var idx = ph[p];
        var sm = phraseScore(mine, idx), sf = phraseScore(free, idx);
        stats.phrases++; stats.before += sm;
        var useFree = sf < sm;
        var fin = null, finScore = sm;
        if (useFree) {
            // Minimal change: start from the engine's fingering, then put the score's
            // own choice back note by note wherever that doesn't raise the phrase score.
            var sub = [], hyb = [];
            for (var j = 0; j < idx.length; j++) { sub.push(events[idx[j]]); hyb.push(free[idx[j]].strings.slice()); }
            var cur = analyse(sub, profileOrKey, opts, hyb), curScore = phraseScore(cur, range(idx.length));
            for (j = 0; j < idx.length; j++) {
                var mineS = fixed[idx[j]];
                if (!mineS || mineS.join(",") === hyb[j].join(",")) continue;
                var keep = hyb[j];
                hyb[j] = mineS.slice();
                var trial = analyse(sub, profileOrKey, opts, hyb), ts = phraseScore(trial, range(idx.length));
                if (ts <= curScore) { cur = trial; curScore = ts; } else hyb[j] = keep;
            }
            fin = cur; finScore = curScore;
        }
        stats.after += useFree ? finScore : sm;
        if (useFree) stats.improved++; else stats.kept++;
        for (j = 0; j < idx.length; j++) {
            var k = idx[j], r = useFree ? fin[j] : mine[k];
            r.changed = useFree && (!fixed[k] || fixed[k].join(",") !== r.strings.join(","));
            r.source = r.changed ? "engine" : "kept";
            out[k] = r;
        }
    }
    return { results: out, stats: stats };
}

// MuseScore numbers strings from the top of the tab (0 = highest string).
function toMuseScoreString(idxLowToHigh, nStrings) { return nStrings - 1 - idxLowToHigh; }

var API = { analyse: analyse, analyseKeeping: analyseKeeping, LEVEL_WEIGHT: LEVEL_WEIGHT, PROFILES: PROFILES, detectProfile: detectProfile,
    defaultOptions: defaultOptions, toMuseScoreString: toMuseScoreString, pitchName: pitchName,
    OK: OK, OLIVE: OLIVE, AMBER: AMBER, RED: RED };
// Node (tests) and MuseScore's require() both provide `exports`; a QML
// import of this file does not, and uses the top-level names instead.
if (typeof exports !== "undefined" && exports) {
    for (var apiKey in API) exports[apiKey] = API[apiKey];
}
