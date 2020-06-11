const fs = require ("fs")
const logger = require('./logger')
const exec = require ('util').promisify ( require("child_process").exec )

module.exports = class {
    /**
     * @typedef ContainerMetadata
     * @property {string} command
     * @property {string} args -- custom arguments to add (only valid when `command` is null)
     */
    /**
     * 
     * @param {string} file 
     */
    constructor (file) {
        this.file = file
        /** @type {Object.<string, Promise<void>>} */
        this.queue = {}
        /** @type {Object.<string, string | ContainerMetadata[]>} */
        this.data = {} 

        this.load ()
    }
    async assertDocker () {
        return exec ("docker --help")
    }
    async runAll () {
        const tasks = Object.keys (this.data).map (image => this.start(image))
        return Promise.all (tasks)
    }
    load () {
        try {
            const data = fs.readFileSync (this.file)
            this.data = JSON.parse (data)
            logger.log (`loaded data from ${this.file}`)
        } catch (error) {
            logger.log (`failed to load data from ${this.file}: ${error}`)
        }
    }
    save () {
        fs.writeFileSync (this.file, JSON.stringify(this.data, null, '\t'))
    }
    add (repo, args, command) {
        const meta = {args: args, command: command}
        const data = this.data[repo]
        if (typeof data === 'string') { throw 'cannot add more containers to a custom script' }
        this.data [repo] = [ ...(data || []), meta ]
    }
    addScript (repo, script) {
        const data = this.data[repo]
        if (typeof data === 'object') { throw 'cannot add a custom script to default containers' }
        this.data [repo] = script
    }
    delete (repo) {
        if (this.data[repo]) {
            delete this.data[repo]
        } else {
            throw `could not find repo: '${repo}'`
        }
    }
    hasRepository (repo) {
        return this.data[repo] ? true : false
    }
    containerName (repo, index) {
        return repo.replace("/","-").replace(':','-') + "-" + index
    }
    async run (repo) {
        if (!this.data[repo]) {
            throw "REPO NOT PRESENT"
        }
        if (this.queue[repo]) {
            logger.log (`build for ${repo} queued...`)
            return this.queue[repo].finally (() => this.start (repo))
        }
        const info = this.data [repo]
        let task 
        if (Array.isArray (info)) {
            task = new Promise ((resolve, reject) => {
                this.pullContainer (repo)
                .then (() => this.killContainers (repo))
                .then (() => info.map ((meta, i) => this.runContainer (repo, this.containerName(repo, i), meta.args, meta.command)))
                .then (arr => Promise.all(arr))
                .then (resolve)
                .catch (reject)
            })
        } 
        this.queue [repo] = task
        return task
    }
    async pullContainer (repo) {
        try {
            await exec (`docker pull ${repo}`)
        } catch (error) {
            logger.log (`failed to pull '${repo}'`)
            throw error
        }
    }
    async killContainers (repo) {
        if (!this.hasRepository(repo)) { throw `repo '${repo}' not found` }

        const name = this.containerName (repo, '')
        const q = `$(docker ps -a -q --filter name=${name}*)`
        try {
            await exec (`docker stop ${q}`)
        } catch (error) {
            logger.log (`failed to stop containers for '${repo}' (ignore if the container was offline)`)
        }
        try {
            await exec (`docker rm -f ${q}`)
        } catch (error) {
            logger.log (`failed to remove containers for '${repo}' (ignore if the container was offline)`)
        }
    }
    async runContainer (repo, container, args="", command) {
        args = args || ""
        try {
            await exec (`docker run -d ${args} --name ${container} ${repo} ${command}`)
            logger.log (`started container '${container}' of image: '${repo}'`)
        } catch (error) {
            logger.log (`failed to run '${repo}' with args='${args}', command='${command}'`)
            throw error
        }
    }
}