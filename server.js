const express = require('express') // call express
const bodyParser = require('body-parser')
const logger = require ('./logger')
const bent = require ('bent')
const Wrapper = require ('./docker-wrapper')
const cli = require ('./cli')
const defaults = require ('./defaults')

/** @type {Wrapper} */
var wrapper
/**
 * 
 * @param {string} hostname 
 * @param {number} port 
 * @param {string} path 
 * @param {function(express.Request, express.Response)} request 
 */
function listen (hostname, port, path, request) {
    return express()
    .use(bodyParser.urlencoded({ extended: true }))
    .use(bodyParser.json())
    .use ('', express.Router ().post (path, request) )
    .listen (port, hostname)
}
/**
 * 
 * @param {object} body
 * @returns {number} 
 */
function onReceiveNotification (body) {
    const callbackUrl = body.callback_url
    const repo = body.repository
    const tag = body.push_data.tag

    if (!callbackUrl || !repo || !repo.repo_name || !tag) { return 400 }

    const fullName = repo.repo_name + ":" + tag
    if (!wrapper.hasRepository(fullName)) { return 401 }

    logger.log (`received push for ${fullName}`)

    let response = {state: 'success', description: ''}
    wrapper.run (fullName)
    .catch (err => { response.state = 'failure'; response.description = err.toString() })
    .finally (() => {
        const post = bent (callbackUrl, 'POST', 'buffer', 200)
        return post ('', response)
    })
    .catch (err => logger.error(`error in sending callback: ${err}`))
    return 200
}
async function onReceiveCommand (body, mainServer, daemonServer) {
    const cmd = body.command
    if (!cmd) { return {error: 'no command'} }
    try {
        const output = await cli.execute (cmd, mainServer, daemonServer, wrapper)
        return {response: output}
    } catch (error) {
        return {error: error.toString()}
    }
}
async function startServer (port, startContainers) {
    port = port || defaults.hook_port
    wrapper = new Wrapper (defaults.config_file)
    if (startContainers) {
        logger.log (`loading all images...`)
        await wrapper.runAll ()
    }
    const mainServer = listen('0.0.0.0', port, defaults.hook_path, (req, res) => {
        res.statusCode = onReceiveNotification (req.body)
        res.send ({})
    })
    const daemonServer = listen('127.0.0.1', defaults.daemon_port, defaults.daemon_path, async (req, res) => {
        const response = await onReceiveCommand (req.body, mainServer, daemonServer)
        logger.log (`received command: ${JSON.stringify(req.body)}, response: ${JSON.stringify(response)}`)
        res.statusCode = 200
        return res.send (response)
    })
    logger.log (`starting server at: 0.0.0.0:${port}`)
    return [wrapper, mainServer, daemonServer]
}
module.exports = startServer

const argv = cli.parse (process.argv)
if (argv._.includes('execute') && !argv.help) {
    startServer(argv.port || 8090, argv["start-container"])
}