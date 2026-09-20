const E = require("./engine.js");
let pass = 0, fail = 0;
function check(name, cond, info) { if (cond) pass++; else { fail++; console.log("FAIL", name, info !== undefined ? JSON.stringify(info) : ""); } }

// helper: sequence of notes/chords, fixed step in ms
function seq(list, step, extra) {
    return list.map((p, i) => Object.assign({ t: i * step, end: i * step + step * 0.95, pitches: Array.isArray(p) ? p : [p], pizz: false, restBefore: false }, extra || {}));
}
const N = { C2: 36, D2: 38, G2: 43, C3: 48, D3: 50, A3: 57, E4: 64, G3: 55, D4: 62, A4: 69, B4: 71, E5: 76, Fs2: 30 };

// 1. Cello C2 + D2 together: impossible (both need the C string)
let r = E.analyse(seq([[N.C2, N.D2]], 500), "cello");
check("cello C2+D2 red", r[0].level === E.RED, r[0]);
check("cello C2+D2 reason", r[0].flags.some(f => f.code === "samestring"), r[0].flags);

// 2. Violin open-G + D4 is a plain fifth-apart double stop -> fine
r = E.analyse(seq([[55, 62]], 500), "violin");
check("violin G3+D4 ok", r[0].level === E.OK, r[0]);

// 3. Violin octave G3(open)... use A3 (G str f2) + A4 (D str f7): span 5 -> ok
r = E.analyse(seq([[57, 69]], 500), "violin");
check("violin fingered octave (frets 2+7) olive - grade 5 technique", r[0].level === E.OLIVE && r[0].flags.some(f => f.code === "stretch"), r[0]);

// 4. Violin tenth A3 + C#5 (73): D string fret 11 vs G f2 -> 9 semis -> red in semitone mode
r = E.analyse(seq([[57, 73]], 500), "violin");
check("violin 10th amber (pros can)", r[0].level === E.AMBER, r[0]);

// 5. Violin sixth-ish stretch: B3 (G f4) + A#4? pick A3 + F5? Use 6-semitone gap across adjacent strings:
// A3 (G f2) + E4 on D string fret 2? that's open-string alternative... use B3(59)+F#4? -> D str f4 = span 0.
// Force: C4 (60, G f5) + D#4? D string f1 span 4 ok. Test extension: A#3 (58, G f3) + F#5? not adjacent.
// Direct: A3 (G f2) + B4 (71, D f9): 7 -> olive (stretch limit 7)
r = E.analyse(seq([[57, 71]], 500), "violin");
check("violin 7-semitone double stop amber", r[0].level === E.AMBER, r[0]);

// 6. Bowed non-adjacent strings: violin G3 open + E5 open = strings 0 and 3 -> red when bowed
r = E.analyse(seq([[55, 88]], 500), "violin");
check("violin G+E bowed red", r[0].level === E.RED && r[0].flags.some(f => f.code === "skip"), r[0]);
// ... but pizz is fine
r = E.analyse(seq([[55, 76]], 500, { pizz: true }), "violin");
check("violin G+E pizz ok", r[0].level === E.OK, r[0]);

// 7. Double bass octaves F#2+F#3 pizz (the earlier audit case): E1 str f14? bass strings E1=28.. F#2=42 on E string?
// Audit: sounding F#1+F#2 (written F#2+F#3). E string f2 + D string f4 -> span 2 -> OK when pizz.
r = E.analyse(seq([[30, 42]], 500, { pizz: true }), "bass");
check("bass octave pizz ok", r[0].level === E.OK, r[0]);
r = E.analyse(seq([[30, 42]], 500), "bass");
check("bass octave bowed red (skip)", r[0].level === E.RED, r[0]);

// 8. Out of range
r = E.analyse(seq([30], 500), "cello");
check("cello below C2 red", r[0].level === E.RED && r[0].flags[0].code === "low", r[0]);

// 8b. A KEPT fingering that is off the end of the fingerboard must be flagged red,
// not silently swapped for a different fingering with no flag at all (regression:
// fixedCandidate used to reject out-of-range frets before evaluate() ever ran,
// so analyse() treated the note as unfingered instead of flagging it).
// Violin E6 (88) forced onto the D string (open 62): fret 26, past maxFret 22.
r = E.analyse(seq([88], 500), "violin", {}, [[1]]);
check("kept fret past maxFret is red, not silently discarded", r[0].level === E.RED && r[0].flags.some(f => f.code === "high"), r[0]);
// analyseKeeping must treat it like any other impossible kept fingering: replaced.
let kr = E.analyseKeeping(seq([88], 500), "violin", {}, [[1]]);
check("keep: out-of-range user fret replaced, not silently kept", kr.results[0].source === "engine" && kr.results[0].changed && kr.results[0].level !== E.RED, kr.results[0]);

// 9. Scale in first position on violin: no shifts expected (G3..B4)
r = E.analyse(seq([55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76, 78, 79], 300), "violin");
check("violin G major 1st pos no flags", r.every(x => x.level === E.OK), r.map(x => [x.strings, x.frets, x.flags.map(f=>f.code)]));

// 10. Same pitches: engine should pick first position, not jump strings
check("violin scale strings rising", r[0].strings[0] === 0 && r[r.length - 1].strings[0] === 3, r.map(x => x.strings[0]));

// 11. Violin line that must shift: E5 string climb E5 F#5 G#5 A5 B5 C#6 D6 E6 (76..88)
r = E.analyse(seq([57, 60, 64, 69, 72, 76, 81, 84, 88, 93], 400), "violin");
let shifts = r.filter(x => x.flags.some(f => f.code === "shift")).length;
check("violin climb has shifts", shifts >= 1, r.map(x => [x.frets, x.flags.map(f => f.code)]));
check("violin climb not red", r.every(x => x.level < E.RED), r.map(x => x.flags));

// 12. Same climb as fast 16ths -> same shift flag, never red (shifts are not graded)
r = E.analyse(seq([57, 60, 64, 69, 72, 76, 81, 84, 88, 93], 120), "violin");
check("fast climb: shift olive only", r.some(x => x.flags.some(f => f.code === "shift")) && r.every(x => x.flags.every(f => f.code !== "shift" || f.level === E.OLIVE)), r.map(x => x.flags));
// 12b. Minimise shift COUNT: a line playable in one position must get zero shifts
r = E.analyse(seq([62, 64, 66, 67, 69, 71, 72, 74], 150), "violin");
check("one-position line: no shifts", r.every(x => !x.flags.length), r.map(x => [x.strings, x.frets]));

// 13. Open string does not count for grip: violin alternating open E5 with B5, C#6 (frets 7,9)
r = E.analyse(seq([83, 76, 85, 76, 83, 76], 150), "violin");
check("open string pedal no shift", r.every(x => !x.flags.some(f => /shift/.test(f.code))), r.map(x => [x.frets, x.flags]));

// 14. mm mode: cello thumb-position 5-semitone chord up high is fine in mm, red in semis
const hi = [[57 + 12, 57 + 12 + 7 + 5]]; // A4 on A string? build: D string f19 (69) + A string f
r = E.analyse(seq([[62 + 12, 69 + 12 + 4]], 500), "cello"); // D3 str f24? keep simple below
const chord = [[50 + 14, 57 + 14 + 6]]; // D str f14 + A str f20 -> 6 semis
let rs = E.analyse(seq(chord, 500), "cello", { unit: "semitones" });
let rm = E.analyse(seq(chord, 500), "cello", { unit: "mm" });
check("cello high 6-semi double stop: amber in semis", rs[0].flags.some(f => f.code === "pro"), rs[0]);
check("cello high 6-semi: fine in mm", !rm[0].flags.some(f => f.code === "stretch" || f.code === "span"), rm[0]);

// 14b. Cello reach = frets 1-6; fret 7 is the next string open (except on A)
// C major from C2 across all strings: every note fits frets 0-6 -> no flags
r = E.analyse(seq([36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62], 200), "cello");
check("cello 2-octave scale low region: no shifts", r.every(x => !x.flags.length), r.map(x => [x.strings, x.frets]));
check("cello G2 taken as open G string, not C-string fret 7", r[4].strings[0] === 1 && r[4].frets[0] === 0, r[4]);
check("cello frets 1+6 in a line: extension, no shift", (() => { const x = E.analyse(seq([37, 42], 300), "cello"); return x[1].flags.some(f => f.code === "extension") && !x.some(y => y.flags.some(f => f.code === "shift")); })());
check("cello frets 2-5 in a line: fits, no flag", E.analyse(seq([38, 40, 41], 300), "cello").every(x => !x.flags.length));
// C major C2 -> E4 never uses fret 1, so a hand covering frets 2-7 plays it all: no shift.
r = E.analyse(seq([36, 38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64], 200), "cello");
check("cello C major C2-E4 stepwise: all white (hand slides within its 1-6-sized range)", r.every(x => !x.flags.length), r.map(x => [x.strings, x.frets, x.flags.map(f => f.code)]));
// With the hand anchored at fret 1 (C#2 only exists on the C string), E4 on A (fret 7) is out of reach: one shift.
r = E.analyse(seq([37, 43, 50, 57, 64], 200), "cello");
check("cello fret 1 then A-string E4: exactly one shift, on E4", r.filter(x => x.flags.some(f => f.code === "shift")).length === 1 && r[4].flags.some(f => f.code === "shift"), r.map(x => [x.strings, x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([57, 59, 60, 62, 64], 200), "cello");
check("cello A string 0 2 3 5 7 stepwise: white (hand slides, never holds 2 and 7 together)", r.every(x => !x.flags.length), r.map(x => [x.frets, x.flags.map(f => f.code)]));

// 14c. Double bass reach frets 1-4 (Alfons): F1 F#1 G1 G#1 on the E string + A string equivalents, no shift
r = E.analyse(seq([29, 30, 31, 32, 34, 35, 36, 37], 250), "bass");
check("bass frets 1-4 on two strings: no shift", r.every(x => !x.flags.length), r.map(x => [x.strings, x.frets]));
// fret 1 then fret 5 on the G string (A2 has no lower alternative once anchored low): shift
r = E.analyse(seq([29, 44, 48], 250), "bass");
check("bass frets 1 then 5: extension, no shift", r[2].flags.some(f => f.code === "extension") && !r.some(x => x.flags.some(f => f.code === "shift")), r.map(x => [x.strings, x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([29, 44, 49], 250), "bass");
check("bass frets 1 then 6: shift", r[2].flags.some(f => f.code === "shift"), r.map(x => [x.strings, x.frets, x.flags.map(f => f.code)]));

// 14d. Double stops = reach - 1 (Alfons): cello comfortable 4, olive 5, red 6+; bass comfortable 2, olive 3, red 4+
function span(pitches, prof) { const x = E.analyse(seq([pitches], 500), prof)[0]; return x.flags.map(f => f.code).filter(c => c === "stretch" || c === "pro" || c === "span")[0] || "ok"; }
check("cello DS span 4 ok", span([36 + 1, 43 + 5], "cello") === "ok");        // C str f1 + G str f5
check("cello DS span 5 olive", span([36 + 1, 43 + 6], "cello") === "stretch"); // f1 + f6
check("cello DS span 6 amber (D f2 + A f8)", span([50 + 2, 57 + 8], "cello") === "pro", span([52, 65], "cello"));
check("cello DS span 7 red (D f2 + A f9)", span([50 + 2, 57 + 9], "cello") === "span", span([52, 66], "cello"));
check("cello line span 5 (frets 1-6): extension, not shift", E.analyse(seq([37, 49], 300), "cello").every(x => !x.flags.some(f => f.code === "shift")));
check("bass DS span 2 ok", span([28 + 1, 33 + 3], "bass") === "ok");
check("bass DS span 3 olive", span([28 + 1, 33 + 4], "bass") === "stretch");
check("bass DS span 4 amber (D f1 + G f5)", span([38 + 1, 43 + 5], "bass") === "pro", span([39, 48], "bass"));

// 14e. Violin/viola: hand at frets 2-7, one finger stretches to 9 = olive extension, no shift; 10 = shift.
// One-string profiles so the engine can't dodge onto the next string (which it rightly does in real music).
const vln1 = Object.assign({}, E.PROFILES.violin, { strings: [76] }), vla1 = Object.assign({}, E.PROFILES.viola, { strings: [69] });
r = E.analyse(seq([78, 80, 81, 83, 85], 250), vln1);   // frets 2 4 5 7 9 stepwise
check("violin 2..9 stepwise: white (hand slides)", r.every(x => !x.flags.length), r.map(x => [x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([78, 85], 250), vln1);               // fret 2 straight to 9: hand holds both
check("violin 2 -> 9 jump: olive extension", r[1].flags.some(f => f.code === "extension") && !r[1].flags.some(f => f.code === "shift"), r.map(x => [x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([78, 80, 81, 83, 88], 250), vln1);   // ... to fret 12: 10 semitones -> shift
check("violin 2..12: shift", r[4].flags.some(f => f.code === "shift"), r.map(x => [x.frets, x.flags.map(f => f.code)]));
// mm: the 0-9 / 2-7 hand is a physical size, so centred on fret 12 it covers more frets
r = E.analyse(seq([88, 91, 93, 96], 250), vln1, { unit: "mm" });   // frets 12 15 17 20
check("violin mm: frets 12-20 fit one hand (no flag)", r.every(x => !x.flags.some(f => /shift|extension/.test(f.code))), r.map(x => [x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([88, 96], 250), vln1, { unit: "semitones" });   // 12 straight to 20
check("violin semitones: 12 -> 20 jump = extension", r[1].flags.some(f => f.code === "extension"), r.map(x => [x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([88, 96], 250), vln1, { unit: "mm" });
check("violin mm: 12 -> 20 jump fits one hand", !r[1].flags.some(f => /extension|shift/.test(f.code)), r.map(x => [x.frets, x.flags.map(f => f.code)]));
r = E.analyse(seq([71, 78], 250), vla1);
check("viola 2 -> 9 jump: extension", r[1].flags.some(f => f.code === "extension"), r.map(x => [x.frets, x.flags.map(f => f.code)]));
// real 4-string violin: the same notes are played in one position (F#5 on the A string), no flag at all
check("violin 4 strings finds the no-stretch fingering", E.analyse(seq([78, 80, 81, 83, 85], 250), "violin").every(x => !x.flags.length));
check("cello frets 1..7 in a line: shift", E.analyse(seq([37, 40, 42, 44], 250), Object.assign({}, E.PROFILES.cello, { strings: [36] })).some(x => x.flags.some(f => f.code === "shift")));
check("violin DS span 6 olive", span([55 + 1, 62 + 7], "violin") === "stretch", span([56, 69], "violin"));
check("violin DS span 7 amber (hard, pros can)", span([62 + 2, 69 + 9], "violin") === "pro", span([64, 78], "violin"));
check("violin tenth (span 9, frets 2+11) amber", E.analyse(seq([[57, 73]], 500), "violin")[0].level === E.AMBER);
check("violin DS span 10 red", E.analyse(seq([[57, 74]], 500), "violin")[0].level === E.RED);
check("cello DS frets 1+7 amber", span([50 + 1, 57 + 7], "cello") === "pro", span([51, 64], "cello"));
check("bass DS frets 1+5 amber", span([38 + 1, 43 + 5], "bass") === "pro", span([39, 48], "bass"));
check("bass DS frets 1+6 red", span([38 + 1, 43 + 6], "bass") === "span", span([39, 49], "bass"));

// 14f. Grade-3 calibration: closed hand + one normal extension is not flagged
const cel1 = Object.assign({}, E.PROFILES.cello, { strings: [57] });   // A string only: no escapes
const flagsOf = (ps, prof) => E.analyse(seq(ps, 250), prof).map(x => x.flags.map(f => f.code).filter(c => c !== "pos").join("+") || "-");
check("cello line 1-5: no flag", flagsOf([58, 60, 62], cel1).every(c => c === "-"), flagsOf([58, 60, 62], cel1));
check("cello line 2-6: no flag", flagsOf([59, 61, 63], cel1).every(c => c === "-"), flagsOf([59, 61, 63], cel1));
check("cello line 1-6: olive extension", flagsOf([58, 60, 63], cel1)[2] === "extension", flagsOf([58, 60, 63], cel1));
check("cello line 1-7: shift", flagsOf([58, 60, 64], cel1)[2] === "shift", flagsOf([58, 60, 64], cel1));
check("violin line 1-7: no flag", flagsOf([77, 80, 83], vln1).every(c => c === "-"), flagsOf([77, 80, 83], vln1));
check("violin line 2-8: no flag", flagsOf([78, 81, 84], vln1).every(c => c === "-"), flagsOf([78, 81, 84], vln1));
check("violin line 2-9: olive extension", flagsOf([78, 81, 85], vln1)[2] === "extension", flagsOf([78, 81, 85], vln1));
check("violin high-position flag starts above fret 14", E.analyse(seq([90], 250), vln1)[0].flags.length === 0 && E.analyse(seq([91], 250), vln1)[0].flags.some(f => f.code === "pos"));

// 14g. Stretch vs shift (level rules + context). Cello A string only: frets 1 3 [7] 3
const excursion = [58, 60, 64, 58];   // frets 1 3 [7] 1
let fastR = E.analyse(seq(excursion, 120), cel1), slowR = E.analyse(seq(excursion, 600), cel1);
check("fast one-note excursion: amber stretch, no shifts", fastR[2].flags.some(f => f.code === "prostretch" && f.level === E.AMBER) && !fastR.some(x => x.flags.some(f => f.code === "shift")), fastR.map(x => [x.frets, x.flags.map(f => f.code)]));
check("slow one-note excursion: shift out and back (olive)", slowR.filter(x => x.flags.some(f => f.code === "shift")).length === 2 && !slowR.some(x => x.flags.some(f => f.code === "prostretch")), slowR.map(x => [x.frets, x.flags.map(f => f.code)]));
const moveUp = [58, 60, 64, 65, 64];   // frets 1 3 then stays up at 7 8 7
fastR = E.analyse(seq(moveUp, 120), cel1);
check("fast move up that stays: one shift, no amber", fastR.filter(x => x.flags.some(f => f.code === "shift")).length === 1 && !fastR.some(x => x.flags.some(f => f.code === "prostretch")), fastR.map(x => [x.frets, x.flags.map(f => f.code)]));
check("olive extension preferred over shifting out and back, even slow", E.analyse(seq([58, 60, 63, 60], 600), cel1)[2].flags.some(f => f.code === "extension"));
const noShift = E.analyse(seq([58, 60, 64, 65], 600), cel1, { shifts: false });
check("Shifts checkbox off: level flags only, no shift marks", !noShift.some(x => x.flags.some(f => f.code === "shift")), noShift.map(x => x.flags.map(f => f.code)));

// 14h. Alfons's Banshee cello bar (bug report): G string 4 4 1 2 4 6 + open D -> all white
const bar1 = [47, 47, 47, 47, 47, 49, 47, 47], bar2 = [47, 47, 44, 45, 47, 49, 50, 47, 47];
r = E.analyse(seq(bar1.concat(bar2), 200), "cello");
check("Banshee cello 4 4 1 2 4 6 0 4 4: no flags", r.every(x => !x.flags.length), r.map(x => [x.strings, x.frets, x.flags.map(f => f.code)]));
check("... fingered on the G string as in the tab", r.slice(8).map(x => x.frets[0]).join(" ") === "4 4 1 2 4 6 0 4 4", r.slice(8).map(x => [x.strings, x.frets]));
// but 1 straight to 6 (hand holds both) is still the olive pinky stretch
check("cello 1 -> 6 directly: olive extension", E.analyse(seq([44, 49], 250), Object.assign({}, E.PROFILES.cello, { strings: [43] }))[1].flags.some(f => f.code === "extension"));

// 14i. Keep the score's fingering unless the engine finds a better one (per phrase, (sum of weights)^2)
// Violin: A4 on the D string fret 7 (fine, white) instead of open A -> equally good -> kept
let mineFix = [[1]];   // string index 1 = D string (low->high)
kr = E.analyseKeeping(seq([69], 300), "violin", {}, mineFix);
check("keep: equally good user fingering kept", kr.results[0].source === "kept" && kr.results[0].strings[0] === 1 && !kr.results[0].changed, kr.results[0]);
// A bad user fingering: violin G3-string climb 57 60 64 69 72 76 all forced on the G string -> shifts/high pos
const climb = [57, 60, 64, 69, 72, 76];
kr = E.analyseKeeping(seq(climb, 200), "violin", {}, climb.map(() => [0]));
check("keep: worse user fingering replaced", kr.results.some(x => x.source === "engine") && kr.results.some(x => x.changed) && kr.stats.improved === 1, [kr.stats, kr.results.map(x => [x.strings, x.frets, x.level])]);
check("keep: replacement scores lower", kr.stats.after < kr.stats.before, kr.stats);
// Two phrases (rest between): first user-good kept, second user-bad replaced
let ev2 = seq([69, 71, 72].concat(climb), 200); ev2[3].restBefore = true;
kr = E.analyseKeeping(ev2, "violin", {}, [[2], [2], [2]].concat(climb.map(() => [0])));
check("keep: decided per phrase", kr.results.slice(0, 3).every(x => x.source === "kept") && kr.results.slice(3).some(x => x.source === "engine") && kr.stats.kept === 1 && kr.stats.improved === 1, kr.stats);
// No fingering in the score -> engine everywhere
kr = E.analyseKeeping(seq(climb, 200), "violin", {}, null);
check("keep: no existing fingering -> engine", kr.results.every(x => x.source === "engine" && x.changed));
// Impossible user fingering (two notes on one string) is red -> replaced
kr = E.analyseKeeping(seq([[62, 69]], 500), "violin", {}, [[1, 1]]);
check("keep: same-string user chord replaced", kr.results[0].source === "engine" && kr.results[0].level === E.OK, kr.results[0]);
check("weights 0/1/2/8", E.LEVEL_WEIGHT.join(",") === "0,1,2,8");

// 14j. Minimal change: within an improved phrase, the user's other (fine) choices survive
// violin, one phrase: A4 fingered on the D string (fine, his choice), then a forced bad climb on the G string
const phraseP = [69, 71, 57, 60, 64, 69, 72, 76];
const fixP = [[1], [1]].concat([57, 60, 64, 69, 72, 76].map(() => [0]));
kr = E.analyseKeeping(seq(phraseP, 200), "violin", {}, fixP);
check("minimal change: phrase improved", kr.stats.improved === 1, kr.stats);
check("minimal change: his free choice (A4 on the D string) survives", kr.results[0].strings[0] === 1 && !kr.results[0].changed, kr.results.slice(0, 3).map(x => [x.strings, x.changed]));
const fullRewrite = E.analyse(seq(phraseP, 200), "violin");
const nChangedMin = kr.results.filter(x => x.changed).length;
const nChangedFull = fullRewrite.filter((x, i) => x.strings.join() !== fixP[i].join()).length;
check("minimal change: fewer notes changed than a full rewrite", nChangedMin < nChangedFull, [nChangedMin, nChangedFull]);
check("minimal change: same score as the full rewrite", kr.stats.after === (() => { const s = fullRewrite.reduce((a, x) => a + E.LEVEL_WEIGHT[x.level], 0); return s * s; })(), kr.stats);

// 15. Rest resets the hand: big jump after a rest is not a shift
let ev = seq([57, 59, 88], 300); ev[2].restBefore = true;
r = E.analyse(ev, "violin");
check("rest resets", !r[2].flags.some(f => /shift/.test(f.code)), r[2]);

// 16. Three-note chord bowed -> olive broken chord
r = E.analyse(seq([[55, 62, 71]], 500), "violin");
check("triple stop olive", r[0].level === E.OLIVE && r[0].flags.some(f => f.code === "broken"), r[0]);

// 17. Five notes on violin -> red
r = E.analyse(seq([[55, 62, 69, 76, 79]], 500), "violin");
check("5 notes red", r[0].level === E.RED, r[0]);

// 18. detectProfile Swedish names
check("detect Violoncell", E.detectProfile("", "Violoncell 1") === "cello");
check("detect Kontrabas", E.detectProfile("", "Kontrabas") === "bass");
check("detect Elbas", E.detectProfile("", "Elbas") === "ebass");
check("detect Elgitarr", E.detectProfile("", "Elgitarr") === "guitar");
check("detect Violin 2", E.detectProfile("violin", "Violin 2") === "violin");
check("detect Viola", E.detectProfile("viola", "Viola") === "viola");
check("detect bass guitar id", E.detectProfile("electric-bass", "") === "ebass");

// 19. Performance: 3000 single notes
const t0 = Date.now();
const long = []; for (let i = 0; i < 3000; i++) long.push(55 + ((i * 7) % 24));
E.analyse(seq(long, 150), "violin");
const ms = Date.now() - t0;
check("perf < 5s (Node ~0.3 s, MuseScore's Qt engine ~2 s)", ms < 5000, ms);

console.log(`${pass} passed, ${fail} failed (perf ${ms} ms)`);
process.exit(fail ? 1 : 0);
