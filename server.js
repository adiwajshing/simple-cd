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
 * @param {Object.<string, function(express.Request, express.Response)>} paths
 */
function listen (hostname, port, paths) {
    let exp = express()
        .use(bodyParser.urlencoded({ extended: true }))
        .use(bodyParser.json())
        Object.keys (paths).forEach (key => exp = exp.use (key, express.Router ().post ('', paths[key])) )
        
    return exp.listen (port, hostname)
}
/**
 * 
 * @param {object} body
 * @returns {number} 
 */
function onReceiveDockerNotification (body) {
    const callbackUrl = body.callback_url
    const repo = body.repository
    const tag = body.push_data.tag

    if (!callbackUrl || !repo || !repo.repo_name || !tag) return 400

    const fullName = repo.repo_name + ":" + tag
    if (!wrapper.hasRepository(fullName)) return 404

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
function onReceiveGitNotification (body) {
    const repo = body?.repository?.full_name
    if (!repo) return 400
    
    const fullName = ('github:' + repo).toLowerCase()
    if (!wrapper.hasRepository(fullName)) return 404

    logger.log (`received push for git:${fullName}`)

    wrapper.run (fullName)
    .catch (err => logger.error(`error in running git:${fullName}  ${err}`))

    return 200
}
async function onReceiveCommand (body, mainServer, daemonServer) {
    const cmd = body.command
    if (!cmd) return {error: 'no command'}
    try {
        const output = await cli.execute (cmd, mainServer, daemonServer, wrapper)
        return {response: output}
    } catch (error) {
        return {error: error.toString()}
    }
}
async function startServer (port, startContainers) {
    port = port || defaults.hook_port
    wrapper = new Wrapper (defaults.directory)
    
    if (startContainers) {
        logger.log (`loading all images...`)
        await wrapper.runAll ()
    }
    const server = listen ('0.0.0.0', port, {
        [defaults.docker_hook_path]: (req, res) => {
            res.statusCode = onReceiveDockerNotification (req.body)
            res.send ({})
        },
        [defaults.git_hook_path]: (req, res) => {
            res.statusCode = onReceiveGitNotification (req.body)
            res.send ({})
        }
    })
    const daemonServer = listen('127.0.0.1', defaults.daemon_port, {
        [defaults.daemon_path]: async (req, res) => {
            const response = await onReceiveCommand (req.body, server, daemonServer)
            logger.log (`received command: ${JSON.stringify(req.body)}, response: ${JSON.stringify(response)}`)
            
            res.statusCode = 200
            return res.send (response)
        }
    })
    logger.log (`starting server at: 0.0.0.0:${port}`)
    return [wrapper, server, daemonServer]
}
module.exports = startServer

const argv = cli.parse (process.argv)
if (argv._.includes('execute') && !argv.help) {
    defaults.create_default_directory ()
    startServer(argv.port || 8090, argv["start-container"])
}