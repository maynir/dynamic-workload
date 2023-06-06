const express = require('express')
const cors = require('cors');
const fs = require('fs');
const WorkerNode = require('./workerNode');
const crypto = require('crypto');

const app = express()
const port = 5000

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Parse command-line arguments
const args = process.argv.slice(2);
const instanceIP = args[0];
const peerIP = args[1];

let workQueue = []
let CompleteWorkQueue = []
let numOfCurrentWorkers = 0
let nextWorkId = 1;

const maxNumOfWorkers = 0

app.get('/', (req, res) => {
  res.send(`Instance IP: ${instanceIP}, Peer IP: ${peerIP}`);
})

app.put('/enqueue', (req, res) => {
  const iterations = req.query.iterations;
  const data = req.body;
  const workId = ++nextWorkId;

  const workItem = {
    id: workId,
    data,
    iterations: parseInt(iterations),
  };

  workQueue.push(workItem);

  // TODO: Add async workflow to check if work is handeled by worker

  res.json({ id: workId });
});

app.post('/pullCompleted', (req, res) => {
  const top = req.query.top;
  const numItems = parseInt(top);

  const latestCompletedWork = CompleteWorkQueue.slice(-numItems);

  res.json(latestCompletedWork);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
