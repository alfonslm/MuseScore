// String Grip — quick check with default settings (no dialog).
var Engine = require("./engine.js")
var ScoreRun = require("./score.js")

function main() {
    var score = api.engraving.curScore || curScore
    var res = ScoreRun.check(score, Engine, { CHORD: Element.CHORD, REST: Element.REST }, ScoreRun.defaultRunOptions(), false)
    api.log.info("StringGrip: " + res.summary)
    for (var i = 0; i < res.findings.length; i++) {
        var f = res.findings[i]
        api.log.info("StringGrip: bar " + f.bar + " | " + f.part + " | " + (f.level === 2 ? "RED" : "OLIVE") + " | " + f.text + " | " + f.fingering)
    }
}
