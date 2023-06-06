const crypto = require('crypto');

class WorkerNode {
    constructor(id) {
        this.id = id;
        this.isWorking = false;
    }

    processNextWork(queue, completedWork) {
        if (queue.length > 0 && !this.isWorking) {
            const workItem = queue.shift();
            this.isWorking = true;

            this.performIterations(workItem)
                .then((finalValue) => {
                    completedWork.push({ id: workItem.id, finalValue, workerId: this.id });
                    this.isWorking = false;
                })
                .catch((error) => {
                    console.error(`Error processing work item ${workItem.id}:`, error);
                    this.isWorking = false;
                })
                .finally(() => {
                    this.processNextWork(queue, completedWork);
                });
        }
    }

    performIterations(workItem) {
        const { data, iterations } = workItem;

        return new Promise((resolve, reject) => {
            let hashedData = data;
            for (let i = 0; i < iterations; i++) {
                hashedData = crypto.createHash('sha512').update(hashedData).digest('hex');
            }

            resolve(hashedData);
        });
    }
}

module.exports = WorkerNode;
