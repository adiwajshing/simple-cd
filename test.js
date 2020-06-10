const Wrapper = require ('./docker-wrapper')
/*TODO: actually write decent tests*/

async function testServer () {
    require('./server')(8090, './config.json')

    const bent = require ('bent')
    const post = bent ('http://localhost:8090/docker-hook', 'POST', 'json', 200)

    post ("", {hello: "jedd"})
    .then ( response => console.log (response) )
}

async function testDockerWrapper () {
    const wrapper = new Wrapper ("./config.json")
    await wrapper.start ("adiwajshing/test-repo")
}
//testServer ()