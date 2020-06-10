const express    = require('express') // call express
const bodyParser = require('body-parser')
const logger = require ('./logger')
const bent = require ('bent')
const Wrapper = require ('./docker-wrapper')

const app = express() // define our app using express
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

var router = express.Router()
/** @type {Wrapper} */
var wrapper

router.post('/', function(req, res) {
    const body = req.body
    const callbackUrl = body.callback_url
    const repo = body.repository

    if (!callbackUrl) { res.statusCode = 400; return res.send(); } // bad request
    if (!repo || !repo.repo_name) { res.statusCode = 400; return res.send(); }
    if (!wrapper.hasRepository(repo.repo_name)) { res.statusCode = 400; return res.send(); }

    logger.log (`received push for ${repo.repo_name}`)

    let response = {state: 'success', description: ''}
    wrapper.start (repo.repo_name)
    .catch (err => { response.state = 'failure'; response.description = err.toString() })
    .finally (() => {
        const post = bent (callbackUrl, 'POST', 'buffer', 200)
        return post ('', response)
    })
    .catch (err => logger.error(`error in sending callback: ${err}`))

    return res.json({})
});

app.use('/docker-hook', router)

module.exports = async function (port, configfile) {
    
    wrapper = new Wrapper (configfile)
    logger.log (`loading all images...`)
    await wrapper.runAll ()
    
    app.listen(port, "0.0.0.0")
    logger.log (`starting server at: 0.0.0.0:${port}`)
    return app
}
