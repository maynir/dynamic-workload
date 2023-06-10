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
