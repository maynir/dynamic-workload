# setup AWS CLI
# Detect the operating system
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  PKG_MANAGER='apt-get'
elif [[ "$OSTYPE" == "darwin"* ]]; then
  # Mac OSX
  PKG_MANAGER='brew'
else
  echo "Unsupported operating system: $OSTYPE"
  exit 1
fi

# Install necessary packages
if [ "$PKG_MANAGER" = "apt-get" ]; then
  sudo apt update
  sudo apt install awscli zip jq
elif [ "$PKG_MANAGER" = "brew" ]; then
  brew update
  brew install awscli zip jq
fi

# Configure AWS setup (keys, region, etc)
aws configure