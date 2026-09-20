// String Grip — score walking + applying results. Shared by the dialog
// (Main.qml imports it) and the quick-run macros (require()).
// Needs: score (curScore), Engine (engine.js), T = { CHORD, REST } element types.

var OLIVE_COLOR = "#808000", AMBER_COLOR = "#e07b00", RED_COLOR = "#d40000", BLACK_COLOR = "#000000"
var BLOCK_BARS = 4        // overview: passages are 4-bar blocks
var BLOCK_MIN_NOTES = 8  // ...with at least this many notes, or they're too small to judge
var ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
var olive = OLIVE_COLOR, amber = AMBER_COLOR, red = RED_COLOR, black = BLACK_COLOR

function defaultRunOptions() {
    return { unit: "semitones", chords: true, shifts: true, range: true,
             fastMs: 180, writeTab: true, crossVoices: false, keepFingering: true }
}

function colorString(c) { return String(c).toLowerCase() }
function isOurColor(c) { var s = colorString(c); return s === olive || s === amber || s === red }

function barStarts(score) {
    var starts = []
    var m = score.firstMeasure
    while (m) { starts.push(m.firstSegment.tick); m = m.nextMeasure }
    return starts
}
function barOf(starts, tick) {
    var lo = 0, hi = starts.length - 1, ans = 0
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (starts[mid] <= tick) { ans = mid; lo = mid + 1 } else hi = mid - 1 }
    return ans + 1
}

function plainText(t) { return String(t || "").replace(/<[^>]*>/g, "").toLowerCase() }

// pizz/arco changes per staff: { staffIdx: [[tick, isPizz], ...] }
function scanPizz(score) {
    var map = {}
    var seg = score.firstSegment()
    while (seg) {
        var anns = seg.annotations
        for (var i = 0; anns && i < anns.length; i++) {
            var a = anns[i]
            var txt = ""
            try { txt = plainText(a.text) } catch (e) { txt = "" }
            if (!txt) continue
            var st = Math.floor(a.track / 4)
            var v = null
            if (/\bpizz/.test(txt)) v = true
            else if (/\barco\b|\bord\.?\b|\bnat\.?\b/.test(txt)) v = false
            if (v === null) continue
            if (!map[st]) map[st] = []
            map[st].push([seg.tick, v])
        }
        seg = seg.next
    }
    return map
}
function pizzAt(list, tick) {
    var v = false
    if (!list) return false
    for (var i = 0; i < list.length && list[i][0] <= tick; i++) v = list[i][1]
    return v
}

function stringsFor(Engine, part, key) {
    var prof = Engine.PROFILES[key]
    try {
        var sd = part.instruments[0].stringData
        if (sd && sd.strings && sd.strings.length >= 2) {
            var p = []
            for (var i = 0; i < sd.strings.length; i++) p.push(sd.strings[i].pitch)
            p.sort(function (a, b) { return a - b })
            // MuseScore stores string data at WRITTEN pitch (StringData::pitchOffsetAt
            // = -transpose.chromatic). Double bass and electric bass are written an
            // octave up (40 = written E2, sounds E1 = 28); notes carry concert pitch.
            var off = prof.writtenOffset || 0
            for (i = 0; i < p.length; i++) p[i] -= off
            // Accept any plausible tuning: extra low strings (5-string violin/viola
            // with low C, 5-string bass with low B), scordatura, missing strings.
            var lo = prof.strings[0], hi = prof.strings[prof.strings.length - 1]
            if (p.length >= 3 && p.length <= 7 && p[0] >= lo - 12 && p[p.length - 1] <= hi + 12)
                return { strings: p, fromScore: true }
        }
    } catch (e) {}
    return { strings: prof.strings.slice(), fromScore: false }
}

// Collect events for one staff + voice between ticks.
function collect(score, T, staffIdx, voice, startTick, endTick, pizzList) {
    var events = []
    var cur = score.newCursor()
    cur.staffIdx = staffIdx
    cur.voice = voice
    cur.rewindToTick(startTick)
    var restPending = false
    while (cur.segment && (endTick < 0 || cur.tick < endTick)) {
        var el = cur.element
        if (el && el.type === T.REST) {
            restPending = true
        } else if (el && el.type === T.CHORD) {
            var t = cur.time()
            var tempo = cur.tempo > 0 ? cur.tempo : 2
            var durMs = el.actualDuration.ticks / 480 / tempo * 1000
            var pizz = pizzAt(pizzList, cur.tick)
            var isTab = false, tabApi = true
            try { isTab = !!cur.staff.isTabStaff(cur.fraction) } catch (e) { isTab = false; tabApi = false }   // MuseScore 4.6+

            // grace notes before the beat
            var graces = el.graceNotes
            for (var g = 0; graces && g < graces.length; g++) {
                var gc = graces[g]
                var gp = [], gn = []
                for (var k = 0; k < gc.notes.length; k++) { gp.push(gc.notes[k].pitch); gn.push(gc.notes[k]) }
                var gt = t - (graces.length - g) * 60
                events.push({ t: gt, end: gt + 55, pitches: gp, notes: gn, pizz: pizz, restBefore: restPending && g === 0, tick: cur.tick, tab: isTab, tabApi: tabApi })
            }

            var pitches = [], notes = [], allTied = true
            for (var n = 0; n < el.notes.length; n++) {
                var nt = el.notes[n]
                pitches.push(nt.pitch); notes.push(nt)
                if (!nt.tieBack) allTied = false
            }
            if (allTied && events.length && !restPending) {
                // pure continuation: extend the previous event
                events[events.length - 1].end = t + durMs
            } else {
                events.push({ t: t, end: t + durMs, pitches: pitches, notes: notes, pizz: pizz,
                              restBefore: restPending && !(graces && graces.length), tick: cur.tick, tab: isTab, tabApi: tabApi })
            }
            restPending = false
        }
        if (!cur.next()) break
    }
    return events
}

function mergeVoices(lists) {
    var all = []
    for (var i = 0; i < lists.length; i++) all = all.concat(lists[i])
    all.sort(function (a, b) { return a.t - b.t })
    var out = []
    for (i = 0; i < all.length; i++) {
        var e = all[i], last = out.length ? out[out.length - 1] : null
        if (last && Math.abs(last.t - e.t) < 1) {
            last.pitches = last.pitches.concat(e.pitches)
            last.notes = last.notes.concat(e.notes)
            last.end = Math.max(last.end, e.end)
            last.restBefore = last.restBefore && e.restBefore
        } else {
            out.push({ t: e.t, end: e.end, pitches: e.pitches.slice(), notes: e.notes.slice(), pizz: e.pizz, restBefore: e.restBefore, tick: e.tick })
        }
    }
    // a note sounding over a later onset in another voice is not a rest
    return out
}

// ------------------------------------------------------------ main

function check(score, Engine, T, o, clearOnly) {
    var findings = []
    var overview = []
    var summary = ""

    var sel = score.selection
    var ranged = sel && sel.isRange
    var startTick = ranged ? sel.startSegment.tick : 0
    var endTick = ranged && sel.endSegment ? sel.endSegment.tick : -1
    var startStaff = ranged ? sel.startStaff : 0
    var endStaff = ranged ? sel.endStaff : score.nstaves

    var opts = { unit: o.unit, chords: o.chords, shifts: o.shifts, range: o.range, fastMs: 180 }

    var starts = barStarts(score)
    var pizzMap = clearOnly ? {} : scanPizz(score)
    var counts = { olive: 0, amber: 0, red: 0, parts: 0, notes: 0, tab: 0, phrases: 0, kept: 0, improved: 0 }
    var skipped = []

    score.startCmd(clearOnly ? "String Grip: clear" : "String Grip: check")
    var parts = score.parts
    for (var pi = 0; pi < parts.length; pi++) {
        var part = parts[pi]
        var staff = Math.floor(part.startTrack / 4)   // notation staff only: skips keyswitch & tab staves
        if (staff < startStaff || staff >= endStaff) continue
        var key = Engine.detectProfile(part.instrumentId, part.longName + " " + part.partName)
        if (!key) continue

        var lists = []
        for (var v = 0; v < 4; v++) lists.push(collect(score, T, staff, v, startTick, endTick, pizzMap[staff]))

        // Other staves of the same part (e.g. a linked tablature staff).
        // Notes there with the same tick + pitch mirror the result.
        // Keyswitch staves never match: their pitches differ.
        var mirror = {}
        var mirrorTab = {}   // parallel to mirror: is that note on a tab staff?
        var mirrorLists = []
        var lastStaff = Math.floor((part.endTrack - 1) / 4)
        for (var ms = staff + 1; ms <= lastStaff; ms++)
            for (v = 0; v < 4; v++) {
                var ml = collect(score, T, ms, v, startTick, endTick, null)
                mirrorLists.push(ml)
                for (var mi = 0; mi < ml.length; mi++)
                    for (var mn = 0; mn < ml[mi].notes.length; mn++) {
                        var mk = ml[mi].tick + ":" + ml[mi].pitches[mn]
                        if (!mirror[mk]) { mirror[mk] = []; mirrorTab[mk] = [] }
                        mirror[mk].push(ml[mi].notes[mn])
                        mirrorTab[mk].push(!!ml[mi].tab)
                    }
            }

        // Copies of note j of an event: tab-staff copies vs notation-staff copies.
        // Without MuseScore's isTabStaff (older than 4.6), a linked duplicate staff with the
        // same notes is taken to be the tab.
        var copies = function (ev, j) {
            var key = ev.tick + ":" + ev.pitches[j]
            var mNotes = mirror[key] || [], mTabs = mirrorTab[key] || []
            var tab = [], clef = []
            if (ev.tabApi === false) {
                for (var q = 0; q < mNotes.length; q++) tab.push(mNotes[q])
                clef.push(ev.notes[j])
            } else {
                (ev.tab ? tab : clef).push(ev.notes[j])
                for (q = 0; q < mNotes.length; q++) (mTabs[q] ? tab : clef).push(mNotes[q])
            }
            return { tab: tab, clef: clef }
        }

        // clear our previous colours in range
        var allLists = lists.concat(mirrorLists)
        for (v = 0; v < allLists.length; v++) for (var ei = 0; ei < allLists[v].length; ei++) {
            var ns = allLists[v][ei].notes
            for (var q = 0; q < ns.length; q++) if (isOurColor(ns[q].color)) ns[q].color = black
        }
        if (clearOnly) continue

        var tuning = stringsFor(Engine, part, key)
        var prof = JSON.parse(JSON.stringify(Engine.PROFILES[key]))
        prof.strings = tuning.strings
        counts.parts++
        var partName = part.longName || part.partName
        var ov = { name: partName, notes: 0, lv: [0, 0, 0, 0], blocks: {} }   // overview for this part
        overview.push(ov)

        var voiceLists = o.crossVoices ? [mergeVoices(lists)] : lists
        for (var vl = 0; vl < voiceLists.length; vl++) {
            var events = voiceLists[vl]
            if (!events.length) continue
            // The fingering already in the score (string per note, from this staff or
            // a linked tab staff). Kept unless the engine finds a better one per phrase.
            var fixed = null
            if (o.keepFingering !== false && tuning.fromScore) {
                fixed = []
                for (var fe = 0; fe < events.length; fe++) {
                    var fs = []
                    for (var fn = 0; fn < events[fe].notes.length; fn++) {
                        // YOUR fingering = the tab staff's (Alfons: only the tab counts).
                        var cands = copies(events[fe], fn).tab
                        var sv = -1
                        for (var fc = 0; fc < cands.length && sv < 0; fc++) {
                            var v = cands[fc].string
                            if (v !== undefined && v !== null && v >= 0) sv = v
                        }
                        fs.push(sv >= 0 && sv < prof.strings.length ? prof.strings.length - 1 - sv : null)
                    }
                    fixed.push(fs.indexOf(null) >= 0 ? null : fs)
                }
            }
            var kr = Engine.analyseKeeping(events, prof, opts, fixed)
            var res = kr.results
            counts.phrases += kr.stats.phrases; counts.kept += kr.stats.kept; counts.improved += kr.stats.improved
            for (var i = 0; i < events.length; i++) {
                var ev = events[i], r = res[i]
                counts.notes += ev.notes.length
                // overview: level share per part, and per 4-bar block
                var bar = barOf(starts, ev.tick)
                ov.notes += ev.notes.length
                ov.lv[r.level] += ev.notes.length
                var blk = Math.floor((bar - 1) / BLOCK_BARS)
                if (!ov.blocks[blk]) ov.blocks[blk] = { notes: 0, flagged: 0 }
                ov.blocks[blk].notes += ev.notes.length
                if (r.level >= Engine.OLIVE) ov.blocks[blk].flagged += ev.notes.length
                // tab: string + fret
                var chordImpossible = false
                for (var cf = 0; cf < r.flags.length; cf++) if (r.flags[cf].code === "samestring" || r.flags[cf].code === "count") chordImpossible = true
                if (o.writeTab && tuning.fromScore && !chordImpossible && r.changed) {
                    for (var j = 0; j < ev.notes.length; j++) {
                        var f = r.frets[j]
                        if (f >= 0 && f <= prof.maxFret && r.strings[j] < prof.strings.length) {
                            var sIdx = Engine.toMuseScoreString(r.strings[j], prof.strings.length)
                            var cp = copies(ev, j)
                            var targets = cp.tab.length ? cp.tab : cp.clef   // fingering lives in the tab
                            for (var tg = 0; tg < targets.length; tg++) { targets[tg].string = sIdx; targets[tg].fret = f }
                            counts.tab++
                        }
                    }
                }
                if (!r.flags.length) continue
                // per-note level: all flags (grip) and range-only flags
                var lv = [], lvRange = []
                for (j = 0; j < ev.notes.length; j++) { lv.push(0); lvRange.push(0) }
                for (var fi = 0; fi < r.flags.length; fi++) {
                    var fl = r.flags[fi]
                    var isRange = fl.code === "low" || fl.code === "high"
                    for (j = 0; j < ev.notes.length; j++)
                        if (fl.note < 0 || fl.note === j) {
                            if (fl.level > lv[j]) lv[j] = fl.level
                            if (isRange && fl.level > lvRange[j]) lvRange[j] = fl.level
                        }
                }
                // Alfons: white in the notation staff = in range; white in the tab = easy
                // to play. With a tab staff, grip colours go on the tab and the notation
                // staff only shows range problems. Without one, the notation shows all.
                var marked = []
                for (j = 0; j < ev.notes.length; j++) {
                    if (!lv[j]) continue
                    var cpj = copies(ev, j)
                    var paint = function (list, level) {
                        if (!level) return
                        var col = level === Engine.RED ? red : level === Engine.AMBER ? amber : olive
                        for (var ti = 0; ti < list.length; ti++) list[ti].color = col
                    }
                    if (cpj.tab.length) { paint(cpj.tab, lv[j]); paint(cpj.clef, lvRange[j]) }
                    else paint(cpj.clef, lv[j])
                    marked.push(cpj.tab.length ? cpj.tab[0] : ev.notes[j])
                }
                if (r.level === Engine.RED) counts.red++; else if (r.level === Engine.AMBER) counts.amber++; else counts.olive++
                var msgs = []
                for (fi = 0; fi < r.flags.length; fi++) msgs.push(r.flags[fi].msg)
                var fing = []
                for (j = 0; j < ev.notes.length; j++) fing.push(Engine.pitchName(ev.pitches[j]) + " " + ROMAN[prof.strings.length - r.strings[j]] + (r.frets[j] === 0 ? " open" : " fret " + r.frets[j]))
                findings.push({ bar: barOf(starts, ev.tick), part: part.longName || part.partName,
                                level: r.level, text: msgs.join(" · "), fingering: fing.join(", "), notes: marked })
            }
        }
        if (!tuning.fromScore && o.writeTab) skipped.push((part.longName || part.partName))
    }
    score.endCmd()

    // "Olive shouldn't dominate a grade-3 piece" (Alfons): flag 4-bar blocks where
    // olive-or-worse is more than half of the notes. Listed first.
    var dense = []
    for (var oi = 0; oi < overview.length; oi++) {
        var ovp = overview[oi]
        for (var bk in ovp.blocks) {
            var b = ovp.blocks[bk]
            if (b.notes >= BLOCK_MIN_NOTES && b.flagged * 2 > b.notes) {
                var from = Number(bk) * BLOCK_BARS + 1
                dense.push({ bar: from, part: ovp.name, level: Engine.OLIVE, dense: true,
                             text: "olive or worse in " + Math.round(100 * b.flagged / b.notes) + "% of the notes in bars " + from + "–" + (from + BLOCK_BARS - 1) + " – dominates the passage",
                             fingering: "", notes: [] })
            }
        }
    }
    dense.sort(function (a, b) { return a.part === b.part ? a.bar - b.bar : (a.part < b.part ? -1 : 1) })
    findings = dense.concat(findings)

    if (clearOnly) {
        summary = "Markings cleared" + (ranged ? " in the selection." : ".")
    } else {
        summary = counts.parts + " string part(s), " + counts.notes + " notes" + (ranged ? " in the selection" : "") + ": "
                + counts.red + " red, " + counts.amber + " amber, " + counts.olive + " olive."
                + (o.writeTab ? (o.keepFingering !== false && counts.kept
                      ? " Kept your fingering in " + counts.kept + " of " + counts.phrases + " phrases; improved " + counts.improved + " (" + counts.tab + " notes rewritten)."
                      : " Tab fingering written to " + counts.tab + " notes.") : "")
                + (skipped.length ? " No tuning in the score for " + skipped.join(", ") + " – colours only, tab left alone." : "")
    }
    if (!clearOnly && overview.length) {
        var lines = []
        for (oi = 0; oi < overview.length; oi++) {
            var q = overview[oi]
            if (!q.notes) continue
            var pct = function (x) { return Math.round(100 * x / q.notes) + "%" }
            lines.push(q.name + ": " + q.notes + " notes – white " + pct(q.lv[0]) + ", olive " + pct(q.lv[1])
                       + ", amber " + pct(q.lv[2]) + ", red " + pct(q.lv[3]))
        }
        if (dense.length) lines.push(dense.length + " passage(s) where olive or worse dominates – listed first.")
        summary += "\n" + lines.join("\n")
    }
    return { summary: summary, findings: findings, overview: overview }
}

if (typeof exports !== "undefined" && exports !== null) {
    exports.check = check
    exports.defaultRunOptions = defaultRunOptions
}
