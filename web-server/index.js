const express = require('express')
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const AWS = require('aws-sdk');
const axios = require('axios');

// Parse command-line arguments
const instanceIP = process.argv[3];
const peerIP = process.argv[5];
const securityGroup = process.argv[7];
const keyName = process.argv[9];
const awsKey = process.argv[11];
const awsSecreteKey = process.argv[13];
const awsRegion = process.argv[15];

AWS.config.update({
  accessKeyId: awsKey,
  secretAccessKey: awsSecreteKey,
  region: awsRegion,
});

const app = express()
const port = 5000;
const peerPort = 5000;
const ec2 = new AWS.EC2();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let workQueue = [];
let completeWorkQueue = [];
let numOfCurrentWorkers = 0;
let nextWorkId = 1;
const maxNumOfWorkers = 3;
const privateInstanceIpToInstanceId = {};

const logFilePath = path.join(__dirname, `server-${port}.log`);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

app.use((req, res, next) => {
  let { method, url, ip, query } = req;
  ip = ip.split(':')[3];
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${ip} - ${method} ${url} - Params: ${JSON.stringify(query)}`;

  log('');
  log(logMessage);

  next();
});

app.get('/', (req, res) => {
  res.send(`Instance IP: ${instanceIP}, Peer IP: ${peerIP}`);
})

app.put('/enqueue', (req, res) => {
  const iterations = req.query.iterations;
  const buffer = req.body.data;
  const workId = `${nextWorkId++}-${instanceIP}`;

  const workItem = {
    id: workId,
    buffer,
    iterations: parseInt(iterations),
    timeOfArrival: Date.now()
  };

  log(`New work item: ${JSON.stringify(workItem)}`);

  workQueue.push(workItem);

  log(`Work queue: ${JSON.stringify(workQueue)}`);

  res.json({ id: workId });
});

app.put('/dequeue', async (req, res) => {
  let workItem = workQueue.shift() || {};
  if(Object.keys(workItem).length !== 0) {
    log(`Work item: ${JSON.stringify(workItem)}`);
    log(`Work queue: ${JSON.stringify(workQueue)}`);
    return res.json(workItem);
  }
  try {
    log(`Calling peer instance: http://${peerIP}:${peerPort}/dequeueFromPeer`);
    const response = await axios.put(`http://${peerIP}:${peerPort}/dequeueFromPeer`);
    workItem = response.data;
    log(`Work item: ${JSON.stringify(workItem)}`);
    res.json(workItem);
  }catch (e) {
    log(`Error calling http://${peerIP}:${peerPort}/dequeueFromPeer : ${JSON.stringify(e.message)}`);
    res.json({});
  }
});

app.put('/dequeueFromPeer',  (req, res) => {
  let workItem = workQueue.shift() || {};
  log(`Work item: ${JSON.stringify(workItem)}`);
  log(`Work queue: ${JSON.stringify(workQueue)}`);
  res.json(workItem);
});

app.put('/updateWorkDone', (req, res) => {
  const {id, result} = req.body;
  completeWorkQueue.push({id, result});
  log(`Complete work queue: ${JSON.stringify(completeWorkQueue)}`);
  res.send('OK');
});

app.post('/pullCompleted', async (req, res) => {
  const top = req.query.top;
  const numItems = parseInt(top);

  const latestCompletedWork = completeWorkQueue.splice(0, numItems)
  let summaryCompletedWorks = latestCompletedWork.map(({result, id} )=> ({id, result}));

  if(summaryCompletedWorks.length !== numItems){
    const missingNumItems = numItems - summaryCompletedWorks.length
    try {
      log(`Calling peer instance: http://${peerIP}:${peerPort}/pullCompletedFromPeer?top=${missingNumItems}`);
      const response = await axios.post(`http://${peerIP}:${peerPort}/pullCompletedFromPeer?top=${missingNumItems}`);
      const peerSummaryCompletedWorks = response.data;
      summaryCompletedWorks = [...summaryCompletedWorks, ...peerSummaryCompletedWorks]
    }catch (e) {
      log(`Error calling http://${peerIP}:${peerPort}/pullCompletedFromPeer?top=${missingNumItems}: ${JSON.stringify(e.message)}`);
      return res.send(summaryCompletedWorks)
    }
  }

  log(`${numItems} latest completed works: ${JSON.stringify(summaryCompletedWorks)}`);

  res.send(summaryCompletedWorks)
});

app.post('/pullCompletedFromPeer', (req, res) => {
  const top = req.query.top;
  const numItems = parseInt(top);

  const latestCompletedWork = completeWorkQueue.splice(0, numItems)
  const summaryCompletedWorks = latestCompletedWork.map(({result, id} )=> ({id, result}));

  log(`${numItems} latest completed works: ${JSON.stringify(summaryCompletedWorks)}`);

  res.send(summaryCompletedWorks)
});

app.delete('/killWorker', (req, res) => {
  let { ip } = req;
  ip = ip.split(':')[3];
  const instanceId = privateInstanceIpToInstanceId[ip];
  log(`Instance id to kill: ${instanceId}`);
  const params = { InstanceIds: [instanceId] };

  ec2.terminateInstances(params, (err, data) => {
    if (err) {
      log(`Error terminating instance: ${JSON.stringify(err)}`);
      res.status(500);
      res.json(err);
    } else {
      delete privateInstanceIpToInstanceId[ip];
      numOfCurrentWorkers--;
      log(`Instance terminated: ${JSON.stringify(data.TerminatingInstances)}`);
      log(`privateInstanceIpToInstanceId: ${JSON.stringify(privateInstanceIpToInstanceId)}`);
      res.status(200);
    }
  });
});

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
      SecurityGroups: [securityGroup],
      MinCount: 1,
      MaxCount: 1,
      UserData: Buffer.from(userDataScript).toString('base64'),
    };

    log('Creating new EC2 worker instance...')
    const data = await ec2.runInstances(params).promise();

    const instanceId = data.Instances[0].InstanceId;
    const privateIp = data.Instances[0].PrivateIpAddress;
    privateInstanceIpToInstanceId[privateIp] = instanceId;
    log(`New EC2 instance started with ID: ${instanceId}`);
    log(`privateInstanceIpToInstanceId: ${JSON.stringify(privateInstanceIpToInstanceId)}`);
  } catch (error) {
    numOfCurrentWorkers--;
    log(`Error starting EC2 instance: ${JSON.stringify(error)}`);
  }
}

async function checkWorksAreHandled() {
  log('Check works are handled...');
  if(workQueue.length === 0 ) return log('Queue is empty');
  const {id, timeOfArrival} = workQueue[0];
  const diff = Date.now() - timeOfArrival;
  const diffInSec = diff/ 1000;

  if(diffInSec <= 20) return log('Works are on time');
  if(numOfCurrentWorkers >= maxNumOfWorkers) return log(`Reached max number of workers = ${maxNumOfWorkers}`);
  log(`Found work with id ${id} waiting for ${diffInSec} seconds`);
  await startNewWorkerWithSDK();
}
setInterval(checkWorksAreHandled, 40 * 1000);

function log(msg){
  logStream.write(`${msg}\r\n`);
}

app.listen(port, () => {
  log(`Example app listening on port ${port}`);
})

app.on('close', () => {
  logStream.end();
});
