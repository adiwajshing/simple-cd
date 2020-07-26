#!/usr/bin/env node
const cli = require ('./cli')
const bent = require ('bent')
const fs = require ('fs')
const exec = require ('util').promisify ( require("child_process").exec )
const logger = require ('./logger')
const defaults = require ('./defaults')

async function executeOnDaemon (command) {
    const post = bent (`http://localhost:${defaults.daemon_port}${defaults.daemon_path}`, 'POST', 'json', 200)
    const response = await post ("", {command: command})
    if (response.error) {
        return `got error: ${response.error}`
    }
    return response.response
}
const argv = cli.parse (process.argv)
if (argv.help) {
    return
}
if (argv._.includes('execute')) {
    defaults.create_default_directory ()
    
    exec (`nohup node ${__dirname}/server.js ${process.argv.slice(2).join(' ')} > ${defaults.log_file} 2>&1 &`)
    .then (() => {
        setTimeout (() => {
            executeOnDaemon ('test')
            .catch (error => logger.error(`could not start daemon: ${error}`))
        }, 1000)
    })
    .catch (err => logger.log (`error in starting daemon: ${err}`))
} else {
    const santized = process.argv.slice (2).map((v,i) => i % 2 == 1 ? `"${v}"` : v).join (" ")
    executeOnDaemon (santized)
    .then (output => logger.log (output))
    .catch (error => logger.error (`unable to connect to daemon, did you run 'simple-cd execute'?\nerror: ${error}`))
}