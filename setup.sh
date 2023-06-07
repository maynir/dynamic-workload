# debug
# set -o xtrace

KEY_NAME="cloud-course-$(date +'%s')"
KEY_PEM="$KEY_NAME.pem"

echo "Create key pair $KEY_PEM to connect to instances and save locally"
sudo aws ec2 create-key-pair --key-name "$KEY_NAME" | jq -r ".KeyMaterial" > "$KEY_PEM"

# secure the key pair
chmod 400 "$KEY_PEM"

SEC_GRP="my-sg-$(date +'%s')"

echo "Setup firewall $SEC_GRP for instances"
aws ec2 create-security-group --group-name "$SEC_GRP" --description "Access instances" > /dev/null

# figure out my ip
MY_IP=$(curl ipinfo.io/ip)
echo "My IP: $MY_IP"

echo "Setup rule allowing SSH access to $MY_IP and all instances within the security group"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP" --port 22 --protocol tcp --source-group "$SEC_GRP" --cidr "$MY_IP"/32 > /dev/null

echo "Setup rule allowing HTTP (port 5000) access to $MY_IP and all instances within the security group"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP" --port 5000 --protocol tcp --source-group "$SEC_GRP" --cidr "$MY_IP"/32 > /dev/null

#UBUNTU_20_04_AMI="ami-042e8287309f5df03"
UBUNTU_20_04_AMI="ami-08bac620dc84221eb"

# Creating the first Ubuntu 20.04 instance
echo "Creating Ubuntu 20.04 instance 1..."
RUN_INSTANCES_1=$(aws ec2 run-instances   \
    --image-id $UBUNTU_20_04_AMI        \
    --instance-type t3.micro            \
    --key-name "$KEY_NAME"            \
    --security-groups "$SEC_GRP")

INSTANCE_ID_1=$(echo "$RUN_INSTANCES_1" | jq -r '.Instances[0].InstanceId')

echo "Waiting for instance 1 creation..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID_1"

PUBLIC_IP_1=$(aws ec2 describe-instances  --instance-ids "$INSTANCE_ID_1" |
    jq -r '.Reservations[0].Instances[0].PublicIpAddress'
)
PRIVATE_IP_1=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID_1" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)

echo "New instance 1 $INSTANCE_ID_1 @ $PUBLIC_IP_1"

echo "For debug: ssh -i $KEY_PEM -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@$PUBLIC_IP_1"

# Creating the second Ubuntu 20.04 instance
echo "Creating Ubuntu 20.04 instance 2..."
RUN_INSTANCES_2=$(aws ec2 run-instances   \
    --image-id $UBUNTU_20_04_AMI        \
    --instance-type t3.micro            \
    --key-name "$KEY_NAME"            \
    --security-groups "$SEC_GRP")

INSTANCE_ID_2=$(echo "$RUN_INSTANCES_2" | jq -r '.Instances[0].InstanceId')

echo "Waiting for instance 2 creation..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID_2"

PUBLIC_IP_2=$(aws ec2 describe-instances  --instance-ids "$INSTANCE_ID_2" |
    jq -r '.Reservations[0].Instances[0].PublicIpAddress'
)
PRIVATE_IP_2=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID_2" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)

echo "New instance 2 $INSTANCE_ID_2 @ $PUBLIC_IP_2"

echo "For debug: ssh -i $KEY_PEM -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@$PUBLIC_IP_2"

# Execute script on machine 1
echo "Executing script on instance 1..."
ssh -i "$KEY_PEM" -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@"$PUBLIC_IP_1" /bin/bash << EOF
    echo "Updating apt-get..."
    curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash - > /dev/null
    sudo apt-get update > /dev/null
    echo "Installing nodejs, npm, git..."
    sudo apt-get install -y nodejs git > /dev/null
    echo "Cloning maynir/dynamic-workload.git..."
    git clone https://github.com/maynir/dynamic-workload.git
    cd dynamic-workload/web-server
    echo "Running npm install..."
    sudo npm install > /dev/null
    echo "Starting server..."
    nohup node index.js --instance "$PRIVATE_IP_1" --peer "$PRIVATE_IP_2" --securityGroup "$SEC_GRP" --keyName "$KEY_NAME" &>/dev/null &
    echo "Server up and running!"
    exit
    exit
EOF

# Execute script on machine 2
echo "Executing script on instance 2..."
ssh -i "$KEY_PEM" -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@"$PUBLIC_IP_2" /bin/bash << EOF
    echo "Updating apt-get..."
    curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash - > /dev/null
    sudo apt-get update > /dev/null
    echo "Installing nodejs, npm, git..."
    sudo apt-get install -y nodejs git > /dev/null
    echo "Cloning maynir/dynamic-workload.git..."
    git clone https://github.com/maynir/dynamic-workload.git
    cd dynamic-workload/web-server
    echo "Running npm install..."
    sudo npm install > /dev/null
    echo "Starting server..."
    nohup node index.js --instance "$PRIVATE_IP_2" --peer "$PRIVATE_IP_1" --securityGroup "$SEC_GRP" --keyName "$KEY_NAME" &>/dev/null &
    echo "Server up and running!"
    exit
    exit
EOF

echo "Instances and servers created successfully!"


