const fs = require ("fs")
const logger = require('./logger')
const exec = require ('util').promisify ( require("child_process").exec )

module.exports = class {
    /**
     * @typedef RepoMetadata
     * @property {string[]} [containers] -- the commands to run on the container
     * @property {string} [tag] -- tag to pull (default: latest)
     * @property {string} [args] -- custom arguments to add (only valid when `command` is null)
     * @property {string} [command] -- custom command to execute
     */
    /**
     * 
     * @param {string} file 
     */
    constructor (file) {
        this.file = file
        /** @type {Object.<string, Promise<void>>} */
        this.queue = {}
        /** @type {Object.<string, RepoMetadata>} */
        this.data = null 

        this.load ()
        fs.watchFile (file, () => this.load())
    }
    async assertDocker () {
        return exec ("docker --help")
    }
    async runAll () {
        const tasks = Object.keys (this.data).map (image => this.start(image))
        return Promise.all (tasks)
    }
    load () {
        const data = fs.readFileSync (this.file)
        this.data = JSON.parse (data)
        logger.log (`loaded data from ${this.file}`)
    }
    hasRepository (repo) {
        return (this.data && this.data[repo]) || false
    }
    containerName (image, index) {
        return image.replace("/","-") + "-" + index
    }
    async start (image) {
        if (!this.hasRepository(image)) {
            throw "REPO NOT PRESENT"
        }
        if (this.queue[image]) {
            logger.log (`build for ${image} queued...`)
            return this.queue[image].finally (() => this.start (image))
        }
        let info = this.data [image]
        info.containers = info.containers || [ "" ]

        const task = new Promise ((resolve, reject) => {
            this.pullContainer (image, info.tag)
            .then (() => this.killContainers (image))
            .then (() => info.containers.map ((str, i) => this.run (image, this.containerName(image, i), info.args, str)))
            .then (arr => Promise.all(arr))
            .then (resolve)
            .catch (reject)
        })
        this.queue [image] = task
        return task
    }
    async pullContainer (image, tag) {
        tag = tag || "latest"
        try {
            await exec (`docker pull ${image}:${tag}`)
        } catch (error) {
            logger.log (`failed to pull '${image}:${tag}'`)
            throw error
        }
    }
    async killContainers (image) {
        const q = `$(docker ps -a -q --filter name=${image.replace('/','-')}-*)`
        try {
            await exec (`docker stop ${q}`)
        } catch (error) {
            logger.log (`failed to stop containers for '${image}' (ignore if the container was offline)`)
        }
        try {
            await exec (`docker rm -f ${q}`)
        } catch (error) {
            logger.log (`failed to remove containers for '${image}' (ignore if the container was offline)`)
        }
    }
    async run (image, container, args="", command) {
        args = args || ""
        try {
            await exec (`docker run -d ${args} --name ${container} ${image} ${command}`)
            logger.log (`started container '${container}' of image: '${image}'`)
        } catch (error) {
            logger.log (`failed to run '${image}' with args='${args}', command='${command}'`)
            throw error
        }
    }
}