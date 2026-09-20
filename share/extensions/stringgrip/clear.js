// String Grip — remove olive/red markings (selection, or whole score).
var Engine = require("./engine.js")
var ScoreRun = require("./score.js")

function main() {
    var score = api.engraving.curScore || curScore
    ScoreRun.check(score, Engine, { CHORD: Element.CHORD, REST: Element.REST }, ScoreRun.defaultRunOptions(), true)
}
