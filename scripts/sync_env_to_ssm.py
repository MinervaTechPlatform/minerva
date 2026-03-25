import os
import sys
import boto3

def sync_env_to_ssm(env_file_path: str, environment: str):
    """
    Reads a .env file and upserts every key to AWS Systems Manager Parameter Store
    as a SecureString.
    Prefixes the keys with /minerva/{environment}/
    """
    if not os.path.exists(env_file_path):
        print(f"Error: {env_file_path} not found.")
        sys.exit(1)

    ssm = boto3.client('ssm')
    prefix = f"/minerva/{environment}/"

    with open(env_file_path, "r") as f:
        for line in f:
            # Clean up line
            line = line.strip()
            # Skip empty lines and comments
            if not line or line.startswith("#"):
                continue

            # Split by first '='
            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                # Remove optional surrounding quotes
                value = value.strip().strip("'").strip('"')

                param_name = f"{prefix}{key}"
                print(f"Upserting {param_name} to Parameter Store...")
                
                try:
                    ssm.put_parameter(
                        Name=param_name,
                        Value=value,
                        Type="SecureString",
                        Overwrite=True
                    )
                except Exception as e:
                    print(f"Failed to upsert {param_name}: {e}")
                    sys.exit(1)

    print(f"Successfully synced all parameters to {prefix}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python sync_env_to_ssm.py <path_to_env_file> <environment>")
        sys.exit(1)
    
    env_file = sys.argv[1]
    env_name = sys.argv[2]
    sync_env_to_ssm(env_file, env_name)
