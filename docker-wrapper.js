const fs = require ("fs")
const logger = require('./logger')
const exec = require ('util').promisify ( require("child_process").exec )

module.exports = class {
    /**
     * @typedef ContainerMetadata
     * @property {string} command
     * @property {string} [creds]
     * @property {string} [args] -- custom arguments to add (only valid when `command` is null)
     * @property {string} [buildArgs] -- custom arguments to build with (only valid for git repos)
     */
    /**
     * @param {string} directory 
     */
    constructor (directory) {
        this.directory = directory
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
        const tasks = Object.keys (this.data).map (image => this.run(image))
        return Promise.all (tasks)
    }
    configFilePath () {
        return `${this.directory}config.json`
    }
    load () {
        try {
            const data = fs.readFileSync (this.configFilePath())
            this.data = JSON.parse (data)
            logger.log (`loaded data from ${this.configFilePath()}`)
        } catch (error) {
            logger.log (`failed to load data from ${this.configFilePath()}: ${error}`)
        }
    }
    save () {
        fs.writeFileSync (this.configFilePath(), JSON.stringify(this.data, null, '\t'))
    }
    add (repo, args, buildArgs, command) {
        const meta = {args, command, buildArgs}
        const data = this.data[repo]
        
        if (typeof data === 'string') throw 'cannot add more containers to a custom script'
        
        this.data [repo] = [ ...(data || []), meta ]
    }
    addScript (repo, script) {
        const data = this.data[repo]
        
        if (typeof data === 'object') throw 'cannot add a custom script to default containers'
        
        this.data [repo] = script
    }
    delete (repo) {
        if (this.data[repo]) delete this.data[repo]
        else throw `could not find repo: '${repo}'`
    }
    hasRepository (repo) { return this.data[repo] ? true : false }
    containerName (repo, index) { return repo.replace("/","-").replace(':','-') + "-" + index }
    
    async run (repo) {
        if (!this.data[repo]) throw new Error (`Repo: ${repo} not present`)
        
        if (this.queue[repo]) {
            logger.log (`build for ${repo} queued...`)
            try {
                await this.queue[repo]
            } catch { }
        }

        const info = this.data [repo]
        const isGithub = repo.startsWith('github:')

        let task 
        if (Array.isArray (info)) {
            task = new Promise (async (resolve, reject) => {
                try {
                    await this.pullContainer (repo, isGithub, info[0].buildArgs)
                    await this.killContainers (repo, isGithub)
                    
                    const tasks = info.map ((meta, i) => this.runContainer (repo, this.containerName(repo, i), meta.args, meta.command))
                    await Promise.all(tasks)
                    resolve ()
                } catch (err) { reject (err) }
                delete this.queue[repo]
            })
        } 
        this.queue [repo] = task
        return task
    }
    async pullContainer (repo, isGithub, buildArgs) {
        try {
            if (isGithub) {
                repo = repo.replace ('github:', '')
                buildArgs = buildArgs ? `--build-arg ${buildArgs}` : ''
                await exec (`docker build ${buildArgs} https://github.com/${repo.toLowerCase()}.git#master -t ${repo}`)
            }
            else await exec (`docker pull ${repo}`)
        } catch (error) {
            logger.log (`failed to pull '${repo}'`)
            throw error
        }
    }
    async killContainers (repo) {
        if (!this.hasRepository(repo)) throw `repo '${repo}' not found`
        
        repo = repo.replace ('github:', '')

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
        repo = repo.replace ('github:', '')
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