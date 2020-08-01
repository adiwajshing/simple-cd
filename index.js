#!/usr/bin/env node
const cli = require ('./cli')
const bent = require ('bent')
const fs = require ('fs')
const exec = require ('util').promisify ( require("child_process").exec )
const logger = require ('./logger')
const defaults = require ('./defaults')

const createTimeout = (ms) => new Promise (resolve => setTimeout(resolve, ms))

async function executeOnDaemon (command) {
    const post = bent (`http://localhost:${defaults.daemon_port}${defaults.daemon_path}`, 'POST', 'json', 200)
    const response = await post ("", {command: command})
    if (response.error) return new Error(`got error: ${response.error}`)
    return response.response
}
async function startServer (args) {
    try {
        await exec (`nohup node ${__dirname}/server.js ${args.join(' ')} > ${defaults.log_file} 2>&1 &`)
        await createTimeout (1000)
        await executeOnDaemon ('test')
    } catch (err) {
        logger.log (`error in starting daemon: ${err}`)
        throw err
    }
}
const argv = cli.parse (process.argv)
if (argv.help) {
    return
}
if (argv._.includes('start')) {
    defaults.create_default_directory ()
    startServer (process.argv.slice(2))
    .catch (() => {})
} else if (argv._.includes('restart')) {
    executeOnDaemon (['close'])
    .then (() => logger.log(`closed server`))
    .then (() => createTimeout(1000))
    .then (resp => {
        if (resp instanceof Error) throw resp
        return startServer(['start'])
    })
    .then (() => logger.log('restarted server'))
    .catch (error => logger.log(`Error in starting server: ${error}`))
} else {
    const santized = process.argv.slice (2).map((v,i) => i % 2 == 1 ? `"${v}"` : v).join (" ")
    executeOnDaemon (santized)
    .then (output => logger.log (output))
    .catch (error => logger.error (`unable to connect to daemon, did you run 'simple-cd start'?\nerror: ${error}`))
}