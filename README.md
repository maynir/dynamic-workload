# dynamic-workload

---

## Getting started

1. Clone this repository to your local machine: `git clone git@github.com:maynir/dynamic-workload.git`.
2. Navigate to the repository directory: `cd dynamic-workload`.
3. Run the `init.sh` script to install necessary packages and configure the AWS CLI.
    * Please set region to `eu-west-1`.
4. Run the `setup.sh` script to create an instance with the application running.
5. Wait for the instance to start running. This may take a few minutes.
6. Once the instance is running, access the application by running the example curls in the next section.

---

## Folder Structure

In this project you will find two main folders:

1. web-server.
2. worker.
---

## Web Server API

This is the required end-points:

### `/enqueue`

#### Request

- Method: PUT
- URL: `/enqueue`
- Query Parameters:
   - `iterations` (string, required): The number of iteration for sha512 hash.
- Body Parameters:
   - `data` (string, required): The data to process the sha512 from.

#### Response

- Status Code: 200 OK
- Content Type: application/json
- Body:
   - `id` (number): The new ID assigned to the work.

#### Example

```bash
curl -X PUT http://<public_ip>:5000/enqueue?iterations=10 -d "data=Hello"
```

### `/pullCompleted`

#### Request

- Method: POST
- URL: `/pullCompleted`
- Query Parameters:
   - `top` (number, required): The number of completed works to retrive.

#### Response

- Status Code: 200 OK
- Content Type: application/json
- Body: Array of completed works in the format of `{ id, result }`

#### Example

```bash
curl -X POST http://<public_ip>:5000/pullCompleted?top=2
```

## Failure Modes and Handling

In a real-world project, it is important to consider failure modes and implement mechanisms to handle them. Here are some expected failures and suggestions on how to handle them:

1. **Machine Failure**:

    - Detect failure: Implement a monitoring system to periodically check the health and responsiveness of each machine. Unresponsive machines should be considered failed.
    - Replace failed machines: Use an auto-scaling group or a load balancer to automatically replace failed machines with new ones, ensuring system continuity.
    - Avoid routing to failed machines: Log or mark failed machines as inactive to prevent new requests or jobs from being routed to them.
    - Worker failure: If a worker machine fails, the remaining workers can pick up pending jobs from the failed worker's queue.

2. **Network Split**:

    - Handle network disruptions: Implement a timeout mechanism for requests. If a request takes too long, consider it failed and retry or perform error handling actions.
    - Ensure redundancy: Deploy server and worker instances across multiple availability zones or regions to mitigate the impact of network splits.

3. **AWS Service Outages**:

    - Monitor AWS services: Stay informed about reported incidents or outages. Implement monitoring to detect AWS service disruptions.
    - Graceful handling: Use circuit breaker patterns or fallback mechanisms to handle service failures. Fall back to alternative services or queue failed requests for later processing.
    - Retry with exponential backoff: Implement retries with exponential backoff for failed requests to mitigate temporary service disruptions.

4. **Data Persistence and Recovery**:

    - Persist critical data: Use durable storage solutions like Amazon S3 or Amazon EBS for storing persistent data.
    - Regular backups: Back up important data regularly to guard against data loss.
    - Error handling and recovery: Implement mechanisms to handle failures during job processing. Retry failed jobs or mark them for manual intervention.

5. **Logging and Monitoring**:

    - Comprehensive logging: Implement logging throughout your system to track behavior and health.
    - Centralized logging: Use a centralized logging solution to collect and analyze logs from all instances.
    - Alerts and notifications: Set up alerts and notifications for critical failures or anomalies in the system's behavior.

