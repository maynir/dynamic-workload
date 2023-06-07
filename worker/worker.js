const crypto = require('crypto');
const axios = require('axios');
const path = require("path");
const fs = require("fs");

const firstInstanceIP = process.argv[3];
const secondInstanceIP =process.argv[5];
let isFirstInstanceTurn = true;

const logFilePath = path.join(__dirname, 'worker.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

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

        log(`Calling: http://${instanceIP}:5000/dequeue`);

        const response = await axios.put(`http://${instanceIP}:5000/dequeue`);
        const workItem = response.data;

        log(`workItem: ${JSON.stringify(workItem)}`);

        if (Object.keys(workItem).length !== 0 ) {
            const { buffer, iterations, id } = workItem;
            const result = work(buffer, iterations);

            log(`Calling: http://${instanceIP}:5000/updateWorkDone, ${JSON.stringify({id, result})}`);

            await axios.put(`http://${instanceIP}:5000/updateWorkDone`,{id, result})
            // Do something with the result
            log('Work completed:', result);
        } else {
            log('No work available.');
        }
    } catch (error) {
        log(`Error occurred while processing work: ${JSON.stringify(error)}`);
    }
}

function log(msg){
    logStream.write(`${msg}\r\n`);
}

setInterval(processWork, 5 * 1000);

// const data = 'Hello, world!';
// const buffer = Buffer.from(data, 'utf-8');

// const hashedBuffer = work(buffer, 10);
//
// console.log(hashedBuffer.toString('hex')); // Output the hashed buffer as a hexadecimal string
