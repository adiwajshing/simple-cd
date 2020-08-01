const yargs = require ('yargs')

module.exports = {
    parse: function (argv) {
        return this.parseRunning (argv)
        .command ('start', 'start the server to listen for webhooks', yargs => {
            yargs
            .option('port', {description: 'the port to start the server on', alias: 'p', type: 'number'})
            .option('start-containers', {description: 'should all configured docker containers be started on boot', alias: 's', type: 'boolean', default: true})
        })
        .argv
    },
    parseRunning: function (argv) {
        const imageCommand = (yargs) => 
            yargs
            .positional('image', {describe: "the image", type: 'string'})
            .demandOption ('image')
            .exitProcess (false)

        return yargs (argv)
        .command ('close', 'close the server')
        .command ('restart', 'restart the server')
        .command ('add [image]', 'add a new image to employ CD on', yargs => {
            imageCommand (yargs)
            .option('args', {describe: 'the arguments to run the container with, eg. --mount, -v etc.', type: 'string', default: ''})
            .option('command', {describe: 'the command to run on the container', type: 'string', default: ''})
            .option('script', {describe: 'the custom script you may want to execute instead of the standard stop-run', type: 'string'})
        })
        .command ('delete [image]', 'delete an image from CD', yargs => {
            imageCommand (yargs)
        })
        .command ('stop [image]', 'stop the containers of an image', yargs => {
            imageCommand (yargs)
        })
        .command ('run [image]', 'run the containers of an image', yargs => {
            imageCommand (yargs)
        })
        .command ('view [image]', 'view the container setup of an image', yargs => {
            yargs
            .positional('image', {describe: "the image", type: 'string'})
            .exitProcess (false)
        })
        .help ()
        .alias ('help', 'h')
        .exitProcess (false)
    },
    /**
     * Executes a command modifying the containers & images handled
     * @param {string | string[]} line 
     * @param {Server} mainServer 
     * @param {Server} daemonServer 
     * @param {DockerWrapper} wrapper 
     */
    execute: async function (line, mainServer, daemonServer, wrapper) {
        let args = this.parseRunning (line).argv
        if (args._.includes('close')) {
            setTimeout (() => {
                mainServer.close ()
                daemonServer.close ()
                process.exit (0)
            }, 500)
            return 'exited'
        }
        const imageName = ((args.image && !args.image.includes(':')) ? (args.image + ':latest') : args.image)?.toLowerCase()
        if (args.help) return
        
        switch (args._[0]) {
            case 'add':
                if (args.script) {
                    wrapper.addScript (imageName, args.script)
                } else {
                    wrapper.add (imageName, args.args, args.command)
                }
                wrapper.save ()
                return `added image: ${imageName}`
            case 'delete':
                wrapper.killContainers (imageName)
                wrapper.delete (imageName)
                wrapper.save ()
                return `stopped all containers of ${imageName} and deleted configuration`
            case 'stop':
                await wrapper.killContainers (imageName)
                return `stopped containers of ${imageName}`
            case 'run':
                await wrapper.run (imageName)
                return `started containers of ${imageName}`
            case 'view':
                const data = wrapper.data[imageName]
                if (!data) {
                    return "\n" + Object.keys (wrapper.data).map ((key, i) => `${i+1}. ${key}`).join ('\n')
                }
                return imageName + ': ' + JSON.stringify(data)
            default:
                throw `unknown command '${args._[0]}', use '-h' to see available commands`
        }
    }
}