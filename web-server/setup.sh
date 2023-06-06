# debug
# set -o xtrace

KEY_NAME="cloud-course-$(date +'%s')"
KEY_PEM="$KEY_NAME.pem"

echo "Create key pair $KEY_PEM to connect to instances and save locally"
sudo aws ec2 create-key-pair --key-name "$KEY_NAME" | jq -r ".KeyMaterial" > "$KEY_PEM"

# secure the key pair
chmod 400 "$KEY_PEM"

SEC_GRP="my-sg-$(date +'%s')"

echo "Setup firewall $SEC_GRP"
aws ec2 create-security-group --group-name "$SEC_GRP" --description "Access my instances" > /dev/null


# figure out my ip
MY_IP=$(curl ipinfo.io/ip)
echo "My IP: $MY_IP"


echo "Setup rule allowing SSH access to $MY_IP only"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP" --port 22 --protocol tcp --cidr "$MY_IP"/32 > /dev/null

echo "Setup rule allowing HTTP (port 5000) access to $MY_IP only"
aws ec2 authorize-security-group-ingress --group-name "$SEC_GRP" --port 5000 --protocol tcp --cidr "$MY_IP"/32 > /dev/null

#UBUNTU_20_04_AMI="ami-042e8287309f5df03"
UBUNTU_20_04_AMI="ami-08bac620dc84221eb"

echo "Creating Ubuntu 20.04 instance..."
RUN_INSTANCES=$(aws ec2 run-instances   \
    --image-id $UBUNTU_20_04_AMI        \
    --instance-type t3.micro            \
    --key-name "$KEY_NAME"              \
    --security-groups "$SEC_GRP")

INSTANCE_ID=$(echo "$RUN_INSTANCES" | jq -r '.Instances[0].InstanceId')

echo "Waiting for instance creation..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances  --instance-ids "$INSTANCE_ID" |
    jq -r '.Reservations[0].Instances[0].PublicIpAddress'
)

echo "New instance $INSTANCE_ID @ $PUBLIC_IP"

echo "Execute script on machine"
ssh -i "$KEY_PEM" -o "StrictHostKeyChecking=no" -o "ConnectionAttempts=10" ubuntu@"$PUBLIC_IP" /bin/bash << EOF
    echo "Updating apt-get..."
    curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash - > /dev/null
    sudo apt-get update > /dev/null
    echo "Installing nodejs, npm, git..."
    sudo apt-get install -y nodejs git > /dev/null
    echo "Cloning maynir/dynamic-workload.git..."
    git clone https://github.com/maynir/dynamic-workload.git
    cd dynamic-workload/web-server
    echo "Runing npm install..."
    sudo npm install > /dev/null
    echo "Starting server..."
    nohup node index.js &>/dev/null &
    echo "Server up and running!"
    exit
    exit
EOF

