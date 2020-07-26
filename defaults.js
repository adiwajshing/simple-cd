const fs = require ('fs')
const {homedir} = require ('os')
const baseDirectory = `${homedir}/simple-cd-internal/`

module.exports = {
    docker_hook_path: "/docker-hook",
    git_hook_path: "/git-hook", 
    hook_port: 8090,
    daemon_path: "/cd-daemon",
    daemon_port: 54444,
    directory: baseDirectory,
    log_file: `${baseDirectory}logs.log`,
    create_default_directory: () => { if (!fs.existsSync(baseDirectory)) fs.mkdirSync (baseDirectory) }
}