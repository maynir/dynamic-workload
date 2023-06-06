const express = require('express')
const cors = require('cors');
const fs = require('fs');
const WorkerNode = require('./workerNode');
const crypto = require('crypto');
const path = require('path');

const app = express()
const port = 5000

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Parse command-line arguments
const instanceIP = process.argv[3];
const peerIP = process.argv[5]

let workQueue = []
let CompleteWorkQueue = []
let numOfCurrentWorkers = 0
let nextWorkId = 1;
const maxNumOfWorkers = 0

const logFilePath = path.join(__dirname, 'server.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

app.use((req, res, next) => {
  const { method, url, ip, params } = req;
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${ip} - ${method} ${url} - Params: ${JSON.stringify(params)}\n`;

  logStream.write(logMessage);

  next();
});

app.get('/', (req, res) => {
  res.send(`Instance IP: ${instanceIP}, Peer IP: ${peerIP}`);
})

app.put('/enqueue', (req, res) => {
  const iterations = req.query.iterations;
  const data = req.body;
  const workId = `${++nextWorkId}-${instanceIP}`;

  const workItem = {
    id: workId,
    data,
    iterations: parseInt(iterations),
    timeOfArrival: Date.now()
  };

  workQueue.push(workItem);

  // TODO: Add async workflow to check if work is handeled by worker

  res.json({ id: workId });
});

app.put('/dequeue', (req, res) => {
  const workItem = workQueue.shift() || {};
  res.json(workItem);
});

app.post('/pullCompleted', (req, res) => {
  const top = req.query.top;
  const numItems = parseInt(top);

  const latestCompletedWork = CompleteWorkQueue.splice(0, numItems)
  const summaryCompletedWorks = latestCompletedWork.map(({result, id} )=> ({result, id}));

  res.send(summaryCompletedWorks)
});

function startNewWorker() {

}

function checkWorksAreHandled() {
  logStream.write('Check works are handled');
  const {timeOfArrival} = workQueue[0];
  const diff = Date.now() - timeOfArrival;
  const diffInMin = diff/ 1000 / 60;

  if(diffInMin > 2) {
    startNewWorker();
  }
}
setInterval(checkWorksAreHandled, 60000);

app.listen(port, () => {
  logStream.write(`Example app listening on port ${port}`)
})

app.on('close', () => {
  logStream.end();
});
