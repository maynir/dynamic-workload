const crypto = require('crypto');
const axios = require('axios');

const firstInstanceIP = process.argv[3];
const secondInstanceIP = process.argv[5];
let isFirstInstanceTurn = true;

function work(buffer, iterations) {
    let output = crypto.createHash('sha512').update(buffer).digest();

    for (let i = 0; i < iterations - 1; i++) {
        output = crypto.createHash('sha512').update(output).digest();
    }

    return output;
}

async function processWork() {
    try {
        const instanceIP = isFirstInstanceTurn ? firstInstanceIP : secondInstanceIP;
        isFirstInstanceTurn = !isFirstInstanceTurn;

        const response = await axios.put(`http://${instanceIP}:5000/dequeue`);
        const workItem = response.data;

        if (Object.keys(workItem).length !== 0 ) {
            const { buffer, iterations, id } = workItem;
            const result = work(buffer, iterations);

            await axios.put(`http://${instanceIP}:5000/updateWorkDone`,{id, result})
            // Do something with the result
            console.log('Work completed:', result);
        } else {
            console.log('No work available.');
        }
    } catch (error) {
        console.error('Error occurred while processing work:', error);
    }
}

setInterval(processWork, 30 * 1000); // Every 30 sec


// const data = 'Hello, world!';
// const buffer = Buffer.from(data, 'utf-8');

// const hashedBuffer = work(buffer, 10);
//
// console.log(hashedBuffer.toString('hex')); // Output the hashed buffer as a hexadecimal string
