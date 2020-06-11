const {homedir} = require ('os')
const baseDirectory = `${homedir}/simple-cd-internal/`
module.exports = {
    hook_path: "/docker-hook",
    hook_port: 8090,
    daemon_path: "/cd-daemon",
    daemon_port: 54444,
    directory: baseDirectory,
    config_file: `${baseDirectory}config.json`,
    log_file: `${baseDirectory}logs.log`
}