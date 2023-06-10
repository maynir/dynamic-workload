const crypto = require('crypto');
const axios = require('axios');
const path = require("path");
const fs = require("fs");

const firstInstanceIP = process.argv[3];
const secondInstanceIP =process.argv[5];
let isFirstInstanceTurn = true;

const logFilePath = path.join(__dirname, 'worker.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

let lastTimeWork = Date.now();

function work(buffer, iterations) {
    let output = crypto.createHash('sha512').update(buffer).digest('hex');

    for (let i = 0; i < iterations - 1; i++) {
        output = crypto.createHash('sha512').update(output).digest('hex');
    }

    return output.toString();
}

async function processWork() {
    try {
        const instanceIP = isFirstInstanceTurn ? firstInstanceIP : secondInstanceIP;
        isFirstInstanceTurn = !isFirstInstanceTurn;

        let response;
        try{
            log(`Calling: http://${instanceIP}:5000/dequeue`);
            response = await axios.put(`http://${instanceIP}:5000/dequeue`);
        }catch (e) {
            return log(`Error calling http://${instanceIP}:5000/dequeue : ${JSON.stringify(e.message)}`);
        }
        const workItem = response.data;

        log(`workItem: ${JSON.stringify(workItem)}`);

        if (Object.keys(workItem).length === 0 ) return log('No work available.');
        lastTimeWork = Date.now();
        const { buffer, iterations, id } = workItem;
        const result = work(buffer, iterations);

        try {
            log(`Calling: http://${instanceIP}:5000/updateWorkDone, ${JSON.stringify({id, result})}`);
            await axios.put(`http://${instanceIP}:5000/updateWorkDone`,{id, result})
        }catch (e) {
            return log(`Error calling http://${instanceIP}:5000/updateWorkDone : ${JSON.stringify(e.message)}`);
        }

        // Do something with the result
        log('Work completed:', result);
    } catch (error) {
        log(`Error occurred while processing work: ${JSON.stringify(error)}`);
    }
}

async function checkLastTimeWork () {
    log("Check if worker is needed");
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (currentTime - lastTimeWork > fiveMinutes) {
        log('Starting shut down...');
        await terminateInstance();
    }
}

async function terminateInstance () {
    try {
        log(`Calling: http://${firstInstanceIP}:5000/killWorker`);
        await axios.delete(`http://${firstInstanceIP}:5000/killWorker`)
    }catch (e) {
        return log(`Error calling http://${firstInstanceIP}:5000/updateWorkDone : ${JSON.stringify(e.message)}`);
    }
}

function log(msg){
    logStream.write(`${msg}\r\n`);
}

setInterval(processWork, 5 * 1000); // 5 seconds
setInterval(checkLastTimeWork, 60 * 1000); // 60 seconds
