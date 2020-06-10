module.exports = {
    log: function (txt) { console.log (`[${ new Date().toLocaleString() }][SIMPLECD] ${txt}`) },
    error: function (txt) { console.error (`[${ new Date().toLocaleString() }][SIMPLECD] ${txt}`) }
}