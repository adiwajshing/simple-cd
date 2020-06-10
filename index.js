#!/usr/bin/env node
const yargs = require ('yargs')
const argv = yargs
.option('port', {description: 'the port to start the server on', alias: 'p', type: 'number'})
.option('config', {description: 'path to the config file', alias: 'f', type: 'string'})
.demandOption ('config', "you must specify a config file with --config path/to/file")
.help ()
.alias('help', 'h')
.argv

require('./server')(argv.port || 8090, argv.config)