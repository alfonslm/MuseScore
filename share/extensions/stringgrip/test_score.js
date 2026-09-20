// Integration test for score.js against a mock of the MuseScore plugin API
// (cursor / parts / notes / segments), mirroring the real API surface used.
const Engine = require("./engine.js");
const ScoreRun = require("./score.js");
const T = { CHORD: 93, REST: 94 };
let pass = 0, fail = 0;
function check(n, c, info) { if (c) pass++; else { fail++; console.log("FAIL", n, info === undefined ? "" : JSON.stringify(info, null, 0)); } }

// Build a mock score. staves: [{ part, voices: [[{tick, dur, pitches|null(rest), tieBack?}]] }]
function mockScore(opt) {
    const TPQ = 480, tempo = opt.tempo || 100 / 60; // quarter per second
    const staves = opt.staves;
    const allNotes = [];
    for (const st of staves) for (const v of st.voices) for (const ev of v) if (ev.pitches) {
        ev.notes = ev.pitches.map((p, i) => { const n = { pitch: p, color: "#000000", string: -1, fret: -1, tieBack: ev.tieBack ? {} : null }; allNotes.push(n); return n; });
    }
    function newCursor() {
        const c = { staffIdx: 0, voice: 0, _i: 0, _list: [] };
        c.rewindToTick = function (t) {
            const st = staves[this.staffIdx]; this._list = (st && st.voices[this.voice]) || [];
            this._i = this._list.findIndex(e => e.tick >= t); if (this._i < 0) this._i = this._list.length;
        };
        Object.defineProperty(c, "segment", { get() { return this._i < this._list.length ? { tick: this._list[this._i].tick } : null; } });
        Object.defineProperty(c, "tick", { get() { return this._list[this._i].tick; } });
        Object.defineProperty(c, "tempo", { get() { return tempo; } });
        Object.defineProperty(c, "staff", { get() { const st = staves[this.staffIdx];
            return { isTabStaff() { if (st && st.noApi) throw new Error("no api"); return !!(st && st.tab); } }; } });
        Object.defineProperty(c, "fraction", { get() { return {}; } });
        Object.defineProperty(c, "element", { get() {
            const e = this._list[this._i];
            if (!e.pitches) return { type: T.REST };
            return { type: T.CHORD, notes: e.notes, graceNotes: [], actualDuration: { ticks: e.dur } };
        } });
        c.time = function () { return this._list[this._i].tick / TPQ / tempo * 1000; };
        c.next = function () { this._i++; return this._i < this._list.length; };
        return c;
    }
    const segs = (opt.annotations || []).map(a => ({ tick: a.tick, annotations: [{ track: a.staff * 4, text: a.text }] }));
    segs.forEach((s, i) => s.next = segs[i + 1] || null);
    const measures = []; for (let i = 0; i < 40; i++) measures.push({ firstSegment: { tick: i * 4 * TPQ } });
    measures.forEach((m, i) => m.nextMeasure = measures[i + 1] || null);
    const cmds = [];
    return {
        allNotes, cmds,
        nstaves: staves.length,
        parts: opt.parts,
        selection: opt.selection || { isRange: false, clear() {}, select() {} },
        firstMeasure: measures[0],
        firstSegment() { return segs[0] || null; },
        newCursor, startCmd(n) { cmds.push("start:" + n); }, endCmd() { cmds.push("end"); }
    };
}

const Q = 480, E8 = 240, S16 = 120;
function line(pitches, dur, start) { let t = start || 0; return pitches.map(p => { const e = { tick: t, dur, pitches: p === null ? null : (Array.isArray(p) ? p : [p]) }; t += dur; return e; }); }

// --- Score: cello part (with a keyswitch staff), violin with linked tab staff, piano (ignored)
const celloV1 = line([[36, 38], 43, 45, 47, 48, null, 50], Q);           // bar 1: C2+D2 impossible
const cellKS = line([24, 24, 24], Q);                                     // keyswitch staff at C1
const vln = line([57, 60, 64, 69, 72, 76, 81, 84, 88, 93], S16, 4 * Q * 2); // bar 3: fast arpeggio to A6
const vlnTab = vln.map(e => ({ tick: e.tick, dur: e.dur, pitches: e.pitches.slice() }));
const piano = line([[36, 38, 40]], Q);
const bassPizz = line([[30, 42]], Q, 4 * Q * 4);                          // bar 5: octave, pizz marked -> OK

const parts = [
    { startTrack: 0, endTrack: 8, instrumentId: "violoncello", longName: "Violoncell 1", partName: "Violoncell 1",
      instruments: [{ stringData: { strings: [{ pitch: 36 }, { pitch: 43 }, { pitch: 50 }, { pitch: 57 }] } }] },
    { startTrack: 8, endTrack: 16, instrumentId: "violin", longName: "Violin 1", partName: "Violin 1",
      instruments: [{ stringData: { strings: [{ pitch: 55 }, { pitch: 62 }, { pitch: 69 }, { pitch: 76 }] } }] },
    { startTrack: 16, endTrack: 20, instrumentId: "piano", longName: "Piano", partName: "Piano", instruments: [{}] },
    { startTrack: 20, endTrack: 24, instrumentId: "contrabass", longName: "Kontrabas", partName: "Kontrabas",
      instruments: [{ stringData: { strings: [{ pitch: 40 }, { pitch: 45 }, { pitch: 50 }, { pitch: 55 }] } }] }
];
const staves = [
    { voices: [celloV1, [], [], []] }, { voices: [cellKS, [], [], []] },
    { voices: [vln, [], [], []] }, { voices: [vlnTab, [], [], []] },
    { voices: [piano, [], [], []] },
    { voices: [bassPizz, [], [], []] }
];
const score = mockScore({ staves, parts, annotations: [{ tick: 0, staff: 5, text: "<i>pizz.</i>" }] });

let res = ScoreRun.check(score, Engine, T, ScoreRun.defaultRunOptions(), false);
console.log(res.summary);
res.findings.forEach(f => console.log("  bar", f.bar, f.part, ["", "OLIVE", "AMBER", "RED"][f.level], "|", f.text, "|", f.fingering));

check("undo wrapped", score.cmds[0].startsWith("start:") && score.cmds[1] === "end", score.cmds);
check("cello C2+D2 red", celloV1[0].notes.every(n => n.color === "#d40000"), celloV1[0].notes);
check("cello finding in bar 1", res.findings.some(f => f.bar === 1 && f.part === "Violoncell 1" && f.level === Engine.RED));
check("keyswitch untouched", cellKS.every(e => e.notes.every(n => n.color === "#000000" && n.fret === -1)));
check("piano untouched", piano[0].notes.every(n => n.color === "#000000" && n.fret === -1));
check("violin bar 3 findings", res.findings.some(f => f.bar === 3 && f.part === "Violin 1"), res.findings.map(f => [f.bar, f.part]));
check("violin tab written", vln.every(e => e.notes[0].string >= 0 && e.notes[0].fret >= 0));
check("linked tab mirrors string/fret", vln.every((e, i) => e.notes[0].string === vlnTab[i].notes[0].string && e.notes[0].fret === vlnTab[i].notes[0].fret));
check("linked tab mirrors colour", vln.every((e, i) => e.notes[0].color === vlnTab[i].notes[0].color));
check("violin first note G string (MuseScore idx 3)", vln[0].notes[0].string === 3 && vln[0].notes[0].fret === 2, vln[0].notes[0]);
check("bass pizz octave fine", bassPizz[0].notes.every(n => n.color === "#000000"), bassPizz[0].notes);
check("bass tab E str + D str", bassPizz[0].notes[0].string === 3 && bassPizz[0].notes[1].string === 1, bassPizz[0].notes);

// mm mode + re-run: previous colours cleared first
res = ScoreRun.check(score, Engine, T, Object.assign(ScoreRun.defaultRunOptions(), { chords: false }), false);
check("rerun without chords clears cello red", celloV1[0].notes.every(n => n.color === "#000000"), celloV1[0].notes);

// clear
ScoreRun.check(score, Engine, T, ScoreRun.defaultRunOptions(), false);
ScoreRun.check(score, Engine, T, ScoreRun.defaultRunOptions(), true);
check("clear removes all", score.allNotes.every(n => n.color === "#000000"));

// without pizz marking the bass octave is red (bowed, strings not adjacent)
const score2 = mockScore({ staves, parts });
ScoreRun.check(score2, Engine, T, ScoreRun.defaultRunOptions(), false);
check("bass arco octave red", bassPizz[0].notes.every(n => n.color === "#d40000"), bassPizz[0].notes);

// selection restricted to staff 2..3 (violin) only
const s3 = mockScore({ staves, parts, selection: { isRange: true, startSegment: { tick: 0 }, endSegment: null, startStaff: 2, endStaff: 4, clear() {}, select() {} } });
ScoreRun.check(s3, Engine, T, ScoreRun.defaultRunOptions(), true);
res = ScoreRun.check(s3, Engine, T, ScoreRun.defaultRunOptions(), false);
check("selection limits parts", res.findings.every(f => f.part === "Violin 1"), res.findings.map(f => f.part));

// tuning missing -> no tab written, colours still
const parts4 = JSON.parse(JSON.stringify(parts)); parts4[1].instruments = [{}];
const vln4 = line([[55, 88]], Q);
const s4 = mockScore({ staves: [{ voices: [[], [], [], []] }, { voices: [[], [], [], []] }, { voices: [vln4, [], [], []] }, { voices: [[], [], [], []] }, { voices: [[], [], [], []] }, { voices: [[], [], [], []] }], parts: parts4 });
res = ScoreRun.check(s4, Engine, T, ScoreRun.defaultRunOptions(), false);
check("no tuning: no tab", vln4[0].notes.every(n => n.fret === -1));
check("no tuning: still red", vln4[0].notes.every(n => n.color === "#d40000"));
check("no tuning mentioned", /No tuning in the score for Violin 1/.test(res.summary), res.summary);

// electric bass: MuseScore's stringData is written pitch (40..55), notes are concert (28 = low E)
const ebNotes = line([[28, 33]], Q);
const s5 = mockScore({ staves: [{ voices: [ebNotes, [], [], []] }], parts: [{ startTrack: 0, endTrack: 4, instrumentId: "electric-bass", longName: "Elbas", partName: "Elbas",
    instruments: [{ stringData: { strings: [{ pitch: 40 }, { pitch: 45 }, { pitch: 50 }, { pitch: 55 }] } }] }] });
res = ScoreRun.check(s5, Engine, T, ScoreRun.defaultRunOptions(), false);
check("ebass written-pitch tuning -> tab on open E and A", ebNotes[0].notes[0].fret === 0 && ebNotes[0].notes[0].string === 3 && ebNotes[0].notes[1].fret === 0, ebNotes[0].notes);

// 5-string violin (C3 G3 D4 A4 E5): low C3 becomes playable, tab uses 5 strings
function one(partDef, notes) {
    const sc = mockScore({ staves: [{ voices: [notes, [], [], []] }], parts: [Object.assign({ startTrack: 0, endTrack: 4 }, partDef)] });
    return ScoreRun.check(sc, Engine, T, ScoreRun.defaultRunOptions(), false);
}
const five = { strings: [48, 55, 62, 69, 76].map(p => ({ pitch: p })) };
let v5 = line([48, 50, 55], Q);
res = one({ instrumentId: "violin", longName: "Violin 1", partName: "Violin 1", instruments: [{ stringData: five }] }, v5);
check("5-str violin: C3 open on string V (idx 4)", v5[0].notes[0].string === 4 && v5[0].notes[0].fret === 0 && v5[0].notes[0].color === "#000000", v5[0].notes[0]);
check("5-str violin: D3 C-string fret 2", v5[1].notes[0].string === 4 && v5[1].notes[0].fret === 2, v5[1].notes[0]);
check("5-str violin: tab written", /Tab fingering written to 3/.test(res.summary), res.summary);
let v4 = line([48], Q);
one({ instrumentId: "violin", longName: "Violin 2", partName: "Violin 2", instruments: [{ stringData: { strings: [55, 62, 69, 76].map(p => ({ pitch: p })) } }] }, v4);
check("4-str violin: C3 red", v4[0].notes[0].color === "#d40000", v4[0].notes[0]);
let va5 = line([[48, 76]], Q, 0); // C3 + E5 double stop pizz? bowed -> strings V and I not adjacent -> red
res = one({ instrumentId: "viola", longName: "Viola", partName: "Viola", instruments: [{ stringData: five }] }, va5);
check("5-str viola: E5 open available", !res.findings.some(f => /off the end|below/.test(f.text)), res.findings);
let va5b = line([81], Q); // A5 on the E string fret 5 of a 5-string viola
one({ instrumentId: "viola", longName: "Viola", partName: "Viola", instruments: [{ stringData: five }] }, va5b);
check("5-str viola: A5 on E string first position", va5b[0].notes[0].string === 0 && va5b[0].notes[0].fret === 5, va5b[0].notes[0]);

// Keep the score's own fingering: A4 fingered on the D string (fret 7) stays; a bad one is replaced
function vln1part() { return [{ startTrack: 0, endTrack: 4, instrumentId: "violin", longName: "Violin", partName: "Violin",
    instruments: [{ stringData: { strings: [55, 62, 69, 76].map(p => ({ pitch: p })) } }] }]; }
let keepNotes = line([69], Q);
let sk = mockScore({ staves: [{ voices: [keepNotes, [], [], []], tab: true }], parts: vln1part() });   // staff converted to tab
keepNotes[0].notes[0].string = 2; keepNotes[0].notes[0].fret = 7;           // MuseScore index 2 = D string
res = ScoreRun.check(sk, Engine, T, ScoreRun.defaultRunOptions(), false);
check("score: user fingering kept (string/fret untouched)", keepNotes[0].notes[0].string === 2 && keepNotes[0].notes[0].fret === 7, keepNotes[0].notes[0]);
check("score: summary mentions kept", /Kept your fingering in 1 of 1 phrases/.test(res.summary), res.summary);
let badNotes = line([57, 60, 64, 69, 72, 76], S16);
let sb = mockScore({ staves: [{ voices: [badNotes, [], [], []], tab: true }], parts: vln1part() });
badNotes.forEach(e => { e.notes[0].string = 3; e.notes[0].fret = e.pitches[0] - 55; });   // all on the G string
res = ScoreRun.check(sb, Engine, T, ScoreRun.defaultRunOptions(), false);
check("score: worse user fingering rewritten", badNotes.some(e => e.notes[0].string !== 3), badNotes.map(e => [e.notes[0].string, e.notes[0].fret]));
let sb2 = mockScore({ staves: [{ voices: [badNotes.map(e => ({ tick: e.tick, dur: e.dur, pitches: e.pitches.slice() })), [], [], []] }], parts: vln1part() });
res = ScoreRun.check(sb2, Engine, T, Object.assign(ScoreRun.defaultRunOptions(), { keepFingering: false }), false);
check("score: keepFingering off -> always engine", /Tab fingering written to 6 notes/.test(res.summary), res.summary);

// Overview: a 4-bar block where olive-or-worse is over half the notes -> "dominates" finding, listed first
const highRun = line(Array.from({ length: 16 }, (_, i) => [91, 93, 95, 96][i % 4]), Q);   // violin above fret 14 all the time
const lowRun = line(Array.from({ length: 16 }, (_, i) => [57, 59, 60, 62][i % 4]), Q, 4 * Q * 4);  // bars 5-8, first position
const sd = mockScore({ staves: [{ voices: [highRun.concat(lowRun), [], [], []] }], parts: vln1part() });
res = ScoreRun.check(sd, Engine, T, ScoreRun.defaultRunOptions(), false);
check("overview: dominated block flagged first", res.findings[0] && res.findings[0].dense && res.findings[0].bar === 1 && /bars 1–4/.test(res.findings[0].text), res.findings.slice(0, 2));
check("overview: clean block not flagged", !res.findings.some(f => f.dense && f.bar === 5), res.findings.filter(f => f.dense));
check("overview: per-part line in summary", /Violin: 32 notes – white \d+%, olive \d+%, amber 0%, red 0%/.test(res.summary), res.summary);

// Alfons's real setup: hidden standard staff (stale string/fret) + linked TAB staff (his edits) + keyswitch staff.
// His tab fingering must be read and kept, not overwritten from the hidden staff.
function setup(noApi) {
    const std = line([69, 71, 72], Q), tab = std.map(e => ({ tick: e.tick, dur: e.dur, pitches: e.pitches.slice() })), ks = line([24, 24], Q);
    const staves = [{ voices: [std, [], [], []], noApi }, { voices: [tab, [], [], []], tab: true, noApi }, { voices: [ks, [], [], []], noApi }];
    const sc = mockScore({ staves, parts: [{ startTrack: 0, endTrack: 12, instrumentId: "violin", longName: "Violin", partName: "Violin",
        instruments: [{ stringData: { strings: [55, 62, 69, 76].map(p => ({ pitch: p })) } }] }] });
    std.forEach(e => { e.notes[0].string = 3; e.notes[0].fret = e.pitches[0] - 55; });   // stale & bad: G string frets 14 16 17
    tab.forEach(e => { e.notes[0].string = 2; e.notes[0].fret = e.pitches[0] - 62; });   // his edit: D string (7 9 10)
    return { sc, std, tab };
}
let su = setup(false);
res = ScoreRun.check(su.sc, Engine, T, ScoreRun.defaultRunOptions(), false);
check("real setup: tab-staff edits kept (D string 7 9 10)", su.tab.every(e => e.notes[0].string === 2) && su.tab.map(e => e.notes[0].fret).join(" ") === "7 9 10", su.tab.map(e => [e.notes[0].string, e.notes[0].fret]));
check("real setup: summary says kept", /Kept your fingering in 1 of 1/.test(res.summary), res.summary);
su = setup(true);   // MuseScore without isTabStaff: the later (linked) staff wins
ScoreRun.check(su.sc, Engine, T, ScoreRun.defaultRunOptions(), false);
check("no tab API: linked staff's values still win", su.tab.every(e => e.notes[0].string === 2), su.tab.map(e => [e.notes[0].string, e.notes[0].fret]));

// Colour split (Alfons): grip colours on the tab, notation staff only shows range problems.
function split(pitches) {
    const std = line(pitches, Q), tab = std.map(e => ({ tick: e.tick, dur: e.dur, pitches: e.pitches.slice() }));
    const sc = mockScore({ staves: [{ voices: [std, [], [], []] }, { voices: [tab, [], [], []], tab: true }], parts: [{ startTrack: 0, endTrack: 8,
        instrumentId: "violoncello", longName: "Violoncell", partName: "Violoncell", instruments: [{ stringData: { strings: [36, 43, 50, 57].map(p => ({ pitch: p })) } }] }] });
    ScoreRun.check(sc, Engine, T, ScoreRun.defaultRunOptions(), false);
    return { std, tab };
}
let sp = split([[36, 38]]);   // C2 + D2: impossible grip (red), but both notes are in range
check("split: grip red shows on the tab", sp.tab[0].notes.every(n => n.color === "#d40000"), sp.tab[0].notes.map(n => n.color));
check("split: notation stays white (in range)", sp.std[0].notes.every(n => n.color === "#000000"), sp.std[0].notes.map(n => n.color));
const spw = split([48]);      // C3, playable
check("split: fingering written to the tab only", spw.tab[0].notes[0].string >= 0 && spw.std[0].notes[0].string === -1, [spw.tab[0].notes[0], spw.std[0].notes[0]]);
sp = split([30]);             // F#1: below the cello's C string -> out of range
check("split: out of range is red in the notation too", sp.std[0].notes[0].color === "#d40000" && sp.tab[0].notes[0].color === "#d40000", [sp.std[0].notes[0].color, sp.tab[0].notes[0].color]);
// No tab staff at all: the notation shows everything (nowhere else to show it)
const lone = line([[36, 38]], Q);
ScoreRun.check(mockScore({ staves: [{ voices: [lone, [], [], []] }], parts: [{ startTrack: 0, endTrack: 4, instrumentId: "violoncello", longName: "Violoncell", partName: "Violoncell",
    instruments: [{ stringData: { strings: [36, 43, 50, 57].map(p => ({ pitch: p })) } }] }] }), Engine, T, ScoreRun.defaultRunOptions(), false);
check("no tab staff: notation shows grip colours", lone[0].notes.every(n => n.color === "#d40000"));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
