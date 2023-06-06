const express = require('express')
const cors = require('cors');
const fs = require('fs');
const app = express()
const port = 5000

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send("Hello World, this is May's Dynamic Workload project!")
})

app.put('/enqueue', (req, res) => {
  const iterations = req.query.iterations;
});

app.post('/pullCompleted', (req, res) => {
  const top = req.query.top;
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
