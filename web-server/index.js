PROD = true;
const express = require('express')
const cors = require('cors');
const fs = require('fs');
const WorkerNode = require('./workerNode');
const crypto = require('crypto');
const path = require('path');
const { exec } = require('child_process');
const AWS = require('aws-sdk');

const app = express()
const port = 5000
const ec2 = new AWS.EC2();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Parse command-line arguments
const instanceIP = PROD ? process.argv[3] : 'localhost';
const peerIP = PROD ? process.argv[5] : 'localhost';
const securityGroup = PROD ? process.argv[7] : 'securityGroup';
const keyName = PROD ? process.argv[9] : 'keyName';

let workQueue = [];
let completeWorkQueue = [];
let numOfCurrentWorkers = 0;
let nextWorkId = 1;
const maxNumOfWorkers = 0;

const logFilePath = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

app.use((req, res, next) => {
  const { method, url, ip, params } = req;
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${ip} - ${method} ${url} - Params: ${JSON.stringify(params)}\n`;

  log(logMessage);

  next();
});

app.get('/', (req, res) => {
  res.send(`Instance IP: ${instanceIP}, Peer IP: ${peerIP}`);
})

app.put('/enqueue', (req, res) => {
  const iterations = req.query.iterations;
  const {buffer} = req.body;
  const workId = `${++nextWorkId}-${instanceIP}`;

  const workItem = {
    id: workId,
    buffer,
    iterations: parseInt(iterations),
    timeOfArrival: Date.now()
  };

  workQueue.push(workItem);

  res.json({ id: workId });
});

app.put('/dequeue', (req, res) => {
  const workItem = workQueue.shift() || {};
  res.json(workItem);
});

app.put('/updateWorkDone', (req, res) => {
  const {id, result} = req.body;
  completeWorkQueue.push({id, result});
  res.send('OK');
});

app.post('/pullCompleted', (req, res) => {
  const top = req.query.top;
  const numItems = parseInt(top);

  const latestCompletedWork = completeWorkQueue.splice(0, numItems)
  const summaryCompletedWorks = latestCompletedWork.map(({result, id} )=> ({id, result}));

  res.send(summaryCompletedWorks)
});

function startNewWorker() {
  numOfCurrentWorkers++;
  exec('./../worker/setup_worker.sh', (error, stdout, stderr) => {
    if (error) {
      numOfCurrentWorkers--;
      log(`Error starting EC2 instance: ${error.message}`);
    }
    if (stderr) {
      numOfCurrentWorkers--;
      log(`Error starting EC2 instance: ${stderr}`);
    }
    log('EC2 instance started successfully');
  });
}

async function startNewWorkerWithSDK() {
  numOfCurrentWorkers++;
  try {
    const userDataScript = `#!/bin/bash
    # set -o xtrace
    echo "Updating apt-get..."
    curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash - > /dev/null
    sudo apt-get update > /dev/null
    echo "Installing nodejs, npm, git..."
    sudo apt-get install -y nodejs git > /dev/null
    echo "Cloning maynir/dynamic-workload.git..."
    git clone https://github.com/maynir/dynamic-workload.git
    cd dynamic-workload/worker
    echo "Running npm install..."
    sudo npm install > /dev/null
    echo "Running worker..."
    nohup node worker.js --firstInstanceIP "${instanceIP}" --secondInstanceIP "${peerIP}" &>/dev/null &
    echo "Worker is up and running!"
    `;

    const params = {
      ImageId: 'ami-08bac620dc84221eb',
      InstanceType: 't3.micro',
      KeyName: keyName,
      SecurityGroupIds: [securityGroup],
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userDataScript).toString('base64'),
    };

    const data = await ec2.runInstances(params).promise();

    const instanceId = data.Instances[0].InstanceId;
    log(`New EC2 instance started with ID: ${instanceId}`);
  } catch (error) {
    numOfCurrentWorkers--;
    log('Error starting EC2 instance:', error);
  }
}

async function checkWorksAreHandled() {
  log('Check works are handled');
  const {timeOfArrival} = workQueue[0];
  const diff = Date.now() - timeOfArrival;
  const diffInSec = diff/ 1000;

  if(diffInSec > 20 && numOfCurrentWorkers < maxNumOfWorkers) {
    await startNewWorkerWithSDK();
  }
}
PROD && setInterval(checkWorksAreHandled, 60 * 1000);

function log(msg){
  logStream.write(`${msg}\n`);
}

app.listen(port, () => {
  log(`Example app listening on port ${port}`);
})

app.on('close', () => {
  logStream.end();
});
