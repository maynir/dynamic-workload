# debug
# set -o xtrace

KEY_NAME_1="cloud-course-$(date +'%s')-1"
KEY_PEM_1="$KEY_NAME_1.pem"

echo "Create key pair $KEY_PEM_1 to connect to instances and save locally"
sudo aws ec2 create-key-pair --key-name "$KEY_NAME_1" | jq -r ".KeyMaterial" > "$KEY_PEM_1"

# secure the key pair
chmod 400 "$KEY_PEM_1"

SEC_GRP_1="my-sg-$(date +'%s')-1"

echo "Setup firewall $SEC_GRP_1 for instance 1"
aws ec2 create-security-group --group-name "$SEC_GRP_1" --description "Access instance 1" > /dev/null

# figure out my ip
MY_IP=$(curl ipinfo.io/ip)
echo "My IP: $MY_IP"

echo "Setup rule allowing SSH access to instance 1 from $MY_IP only"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_1" --port 22 --protocol tcp --cidr "$MY_IP"/32 > /dev/null

echo "Setup rule allowing HTTP (port 5000) access to instance 1 from $MY_IP only"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_1" --port 5000 --protocol tcp --cidr "$MY_IP"/32 > /dev/null

# Create the second key pair and instance
KEY_NAME_2="cloud-course-$(date +'%s')-1"
KEY_PEM_2="$KEY_NAME_2.pem"

echo "Create key pair $KEY_PEM_2 to connect to instances and save locally"
sudo aws ec2 create-key-pair --key-name "$KEY_NAME_2" | jq -r ".KeyMaterial" > "$KEY_PEM_2"

# secure the key pair
chmod 400 "$KEY_PEM_2"

SEC_GRP_2="my-sg-$(date +'%s')-2"

echo "Setup firewall $SEC_GRP_2 for instance 2"
aws ec2 create-security-group --group-name "$SEC_GRP_2" --description "Access instance 2" > /dev/null

echo "Setup rule allowing SSH access to instance 2 from $MY_IP only"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_2" --port 22 --protocol tcp --cidr "$MY_IP"/32 > /dev/null

echo "Setup rule allowing HTTP (port 5000) access to instance 2 from $MY_IP only"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_2" --port 5000 --protocol tcp --cidr "$MY_IP"/32 > /dev/null

# Allow SSH traffic from instance 1 to instance 2
echo "Setup rule allowing SSH access from instance 1 to instance 2"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_1" --protocol tcp --port 22 --source-group "$SEC_GRP_2" > /dev/null

# Allow SSH traffic from instance 2 to instance 1
echo "Setup rule allowing SSH access from instance 2 to instance 1"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_2" --protocol tcp --port 22 --source-group "$SEC_GRP_1" > /dev/null

# Allow HTTP traffic from instance 1 to instance 2
echo "Setup rule allowing HTTP access from instance 1 to instance 2"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_1" --protocol tcp --port 5000 --source-group "$SEC_GRP_2" > /dev/null

# Allow HTTP traffic from instance 2 to instance 1
echo "Setup rule allowing HTTP access from instance 2 to instance 1"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP_2" --protocol tcp --port 5000 --source-group "$SEC_GRP_1" > /dev/null

#UBUNTU_20_04_AMI="ami-042e8287309f5df03"
UBUNTU_20_04_AMI="ami-08bac620dc84221eb"

# Creating the first Ubuntu 20.04 instance
echo "Creating Ubuntu 20.04 instance 1..."
RUN_INSTANCES_1=$(aws ec2 run-instances   \
    --image-id $UBUNTU_20_04_AMI        \
    --instance-type t3.micro            \
    --key-name "$KEY_NAME_1"            \
    --security-groups "$SEC_GRP_1")

INSTANCE_ID_1=$(echo "$RUN_INSTANCES_1" | jq -r '.Instances[0].InstanceId')

echo "Waiting for instance 1 creation..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID_1"

PUBLIC_IP_1=$(aws ec2 describe-instances  --instance-ids "$INSTANCE_ID_1" |
    jq -r '.Reservations[0].Instances[0].PublicIpAddress'
)

echo "New instance 1 $INSTANCE_ID_1 @ $PUBLIC_IP_1"

# Creating the second Ubuntu 20.04 instance
echo "Creating Ubuntu 20.04 instance 2..."
RUN_INSTANCES_2=$(aws ec2 run-instances   \
    --image-id $UBUNTU_20_04_AMI        \
    --instance-type t3.micro            \
    --key-name "$KEY_NAME_2"            \
    --security-groups "$SEC_GRP_2")

INSTANCE_ID_2=$(echo "$RUN_INSTANCES_2" | jq -r '.Instances[0].InstanceId')

echo "Waiting for instance 2 creation..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID_2"

PUBLIC_IP_2=$(aws ec2 describe-instances  --instance-ids "$INSTANCE_ID_2" |
    jq -r '.Reservations[0].Instances[0].PublicIpAddress'
)

echo "New instance 2 $INSTANCE_ID_2 @ $PUBLIC_IP_2"

# Execute script on machine 1
echo "Executing script on instance 1..."
ssh -i "$KEY_PEM_1" -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@"$PUBLIC_IP_1" /bin/bash << EOF
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
    nohup node index.js --instance "$PUBLIC_IP_1" --peer "$PUBLIC_IP_2" &>/dev/null &
    echo "Server up and running!"
    exit
    exit
EOF

# Execute script on machine 2
echo "Executing script on instance 2..."
ssh -i "$KEY_PEM_2" -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@"$PUBLIC_IP_2" /bin/bash << EOF
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
    nohup node index.js --instance "$PUBLIC_IP_2" --peer "$PUBLIC_IP_1" &>/dev/null &
    echo "Server up and running!"
    exit
    exit
EOF

echo "Instances and servers created successfully!"


